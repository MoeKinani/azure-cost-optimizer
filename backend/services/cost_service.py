"""
Pulls actual billed costs from Azure Cost Management for current and previous month,
broken down to individual resource IDs. Supports multiple subscriptions.
"""
from __future__ import annotations

import logging
import random
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, parse_qs
from dateutil.relativedelta import relativedelta
from typing import Dict, List, Optional, Tuple

from azure.mgmt.costmanagement import CostManagementClient
from azure.mgmt.costmanagement.models import (
    QueryDefinition,
    QueryTimePeriod,
    QueryDataset,
    QueryAggregation,
    QueryGrouping,
    QueryFilter,
    QueryComparisonExpression,
    TimeframeType,
)

from .azure_auth import get_credential, get_subscription_ids

logger = logging.getLogger(__name__)


def _extract_skiptoken(next_link: str) -> Optional[str]:
    """
    Azure Cost Management next_link is a full URL.
    The SDK's skiptoken parameter wants just the token value, not the whole URL.
    Extract it from the $skiptoken query param, or fall back to the raw value.
    """
    if not next_link:
        return None
    try:
        qs = parse_qs(urlparse(next_link).query)
        return qs.get("$skiptoken", qs.get("skiptoken", [next_link]))[0]
    except Exception:
        return next_link


def _query_with_retry(
    client: "CostManagementClient",
    scope: str,
    parameters: "QueryDefinition",
    max_retries: int = 3,
    initial_delay: float = 30.0,
    **kwargs,
):
    """
    Wraps client.query.usage with automatic retry on Azure Cost Management 429
    (Too Many Requests) responses.  Uses exponential back-off with ±20 % jitter:
    ~30 s, ~60 s, ~120 s between attempts.
    """
    delay = initial_delay
    for attempt in range(max_retries + 1):
        try:
            return client.query.usage(scope=scope, parameters=parameters, **kwargs)
        except Exception as exc:
            is_rate_limit = (
                "429" in str(exc)
                or getattr(exc, "status_code", None) == 429
                or "too many requests" in str(exc).lower()
            )
            if is_rate_limit and attempt < max_retries:
                wait = delay + random.uniform(-delay * 0.2, delay * 0.2)
                logger.warning(
                    "Cost Management 429 on %s — retrying in %.0f s (attempt %d/%d)",
                    scope, wait, attempt + 1, max_retries,
                )
                time.sleep(wait)
                delay *= 2
                continue
            raise


def _month_range(year: int, month: int) -> Tuple[datetime, datetime]:
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    end = start + relativedelta(months=1) - relativedelta(days=1)
    end = datetime(end.year, end.month, end.day, 23, 59, 59, tzinfo=timezone.utc)
    return start, end


def _query_costs(
    client: CostManagementClient,
    scope: str,
    start: datetime,
    end: datetime,
) -> Tuple[Dict[str, float], Optional[str]]:
    """Return ({resource_id_lower: cost_usd}, error_str) for the given period."""
    query = QueryDefinition(
        type="ActualCost",
        timeframe=TimeframeType.CUSTOM,
        time_period=QueryTimePeriod(from_property=start, to=end),
        dataset=QueryDataset(
            granularity="None",
            aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
            grouping=[
                QueryGrouping(type="Dimension", name="ResourceId"),
                QueryGrouping(type="Dimension", name="ResourceType"),
                QueryGrouping(type="Dimension", name="ResourceGroupName"),
            ],
        ),
    )

    result: Dict[str, float] = {}
    try:
        response = _query_with_retry(client, scope, query)
        if not response or not response.rows:
            logger.warning("Cost query returned no rows for %s (%s–%s)", scope, start.date(), end.date())
            return result, None

        col_names = [c.name for c in response.columns]
        logger.debug("Cost query columns for %s: %s", scope, col_names)

        # Azure Cost Management may return the aggregation key ("totalCost") or
        # the aggregation name field ("Cost") as the column name depending on the
        # SDK version and billing scope type.  Try both.
        cost_idx: Optional[int] = None
        for candidate in ("Cost", "totalCost", "PreTaxCost"):
            if candidate in col_names:
                cost_idx = col_names.index(candidate)
                break
        if cost_idx is None:
            msg = f"Cost column not found — columns returned: {col_names}"
            logger.error("Cost column not found in response for %s. Columns returned: %s", scope, col_names)
            return result, msg

        rid_idx  = col_names.index("ResourceId")

        for row in response.rows:
            rid  = str(row[rid_idx]).lower().strip()
            cost = float(row[cost_idx])
            # Use "__unassigned__" for rows with no ResourceId (subscription-level
            # charges: Defender, Support, Marketplace, credits) so they are counted
            # in sum(result.values()) but never matched to any real resource.
            key  = rid if rid else "__unassigned__"
            result[key] = result.get(key, 0.0) + cost
    except Exception as exc:
        msg = type(exc).__name__ + ": " + str(exc)
        logger.error("Cost query failed for %s (%s–%s): %s", scope, start.date(), end.date(), exc)
        return result, msg

    return result, None


def get_three_month_costs(
    subscription_ids: Optional[List[str]] = None,
) -> Tuple[Dict[str, float], Dict[str, float], Dict[str, float], Optional[str]]:
    """
    Returns (current_month, previous_month, two_months_ago, error_str).
    Each dict is {resource_id_lower: cost_usd}, aggregated across all subscriptions.
    The third month improves trend detection and cumulative waste accuracy.
    """
    credential = get_credential()
    sub_ids    = subscription_ids or get_subscription_ids()
    client     = CostManagementClient(credential)

    now = datetime.now(tz=timezone.utc)
    curr_start,  curr_end  = _month_range(now.year, now.month)
    prev_dt                = now - relativedelta(months=1)
    prev_start,  prev_end  = _month_range(prev_dt.year, prev_dt.month)
    prev2_dt               = now - relativedelta(months=2)
    prev2_start, prev2_end = _month_range(prev2_dt.year, prev2_dt.month)

    current:   Dict[str, float] = {}
    previous:  Dict[str, float] = {}
    prev2:     Dict[str, float] = {}
    first_error: Optional[str] = None

    for sub_id in sub_ids:
        scope = f"/subscriptions/{sub_id}"
        logger.info("[%s] Fetching current month costs (%s – %s)",   sub_id, curr_start.date(),  curr_end.date())
        curr,  err = _query_costs(client, scope, curr_start,  curr_end)
        if err and not first_error:
            first_error = err
        logger.info("[%s] Fetching previous month costs (%s – %s)",  sub_id, prev_start.date(),  prev_end.date())
        prev,  err = _query_costs(client, scope, prev_start,  prev_end)
        if err and not first_error:
            first_error = err
        logger.info("[%s] Fetching 2-months-ago costs (%s – %s)",    sub_id, prev2_start.date(), prev2_end.date())
        p2,    err = _query_costs(client, scope, prev2_start, prev2_end)
        if err and not first_error:
            first_error = err
        for rid, cost in curr.items():
            current[rid]  = current.get(rid,  0.0) + cost
        for rid, cost in prev.items():
            previous[rid] = previous.get(rid, 0.0) + cost
        for rid, cost in p2.items():
            prev2[rid]    = prev2.get(rid,    0.0) + cost

    if not current and not previous:
        logger.error(
            "Cost query returned NO data across %d subscription(s). "
            "Check that the service principal has the Cost Management Reader role "
            "at the subscription scope. Common errors appear above.",
            len(sub_ids),
        )
    else:
        logger.info(
            "Cost query complete: %d current, %d previous, %d two-months-ago resources across %d subscription(s)",
            len(current), len(previous), len(prev2), len(sub_ids),
        )
    return current, previous, prev2, first_error


def get_two_month_costs(
    subscription_ids: Optional[List[str]] = None,
) -> Tuple[Dict[str, float], Dict[str, float], Optional[str]]:
    """Backward-compat wrapper — returns (current, previous, error). Use get_three_month_costs for new code."""
    curr, prev, _, err = get_three_month_costs(subscription_ids)
    return curr, prev, err


def get_reservation_covered_resource_ids(
    subscription_ids: Optional[List[str]] = None,
) -> set:
    """
    Returns a set of lowercase resource IDs that were billed under reservation
    pricing (PricingModel = 'Reservation') in the current month.

    Uses AmortizedCost so the benefit is spread across each covered resource
    rather than appearing as a lump-sum on the reservation order.
    Requires only Cost Management Reader — no Reservations API permission needed.
    """
    from typing import Set
    credential = get_credential()
    sub_ids = subscription_ids or get_subscription_ids()
    client  = CostManagementClient(credential)

    now   = datetime.now(tz=timezone.utc)
    start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    end   = datetime(now.year, now.month, now.day, 23, 59, 59, tzinfo=timezone.utc)

    covered: Set[str] = set()

    for sub_id in sub_ids:
        scope = f"/subscriptions/{sub_id}"
        try:
            query = QueryDefinition(
                type="AmortizedCost",
                timeframe=TimeframeType.CUSTOM,
                time_period=QueryTimePeriod(from_property=start, to=end),
                dataset=QueryDataset(
                    granularity="None",
                    aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
                    grouping=[QueryGrouping(type="Dimension", name="ResourceId")],
                    filter=QueryFilter(
                        dimensions=QueryComparisonExpression(
                            name="PricingModel",
                            operator="In",
                            values=["Reservation"],
                        )
                    ),
                ),
            )
            response = _query_with_retry(client, scope, query)
            if response and response.rows:
                col_names = [c.name for c in response.columns]
                rid_idx   = col_names.index("ResourceId")
                for row in response.rows:
                    rid = str(row[rid_idx]).lower().strip()
                    if rid and rid != "unassigned":
                        covered.add(rid)
        except Exception as exc:
            logger.warning("Reservation billing coverage failed for %s: %s", sub_id, exc)

    logger.info("Found %d reservation-covered resource IDs from billing data", len(covered))
    return covered


def get_monthly_cost_history(
    months: int = 6,
    subscription_ids: Optional[List[str]] = None,
) -> Dict[str, List[float]]:
    """
    Returns {resource_id_lower: [cost_oldest, ..., cost_newest]} covering the last N
    months (including the current partial month). One monthly-granularity query per sub.
    """
    credential = get_credential()
    sub_ids    = subscription_ids or get_subscription_ids()
    client     = CostManagementClient(credential)

    now = datetime.now(tz=timezone.utc)
    # Build ordered month key list: "YYYY-MM", oldest → newest
    month_keys: List[str] = [
        f"{(now - relativedelta(months=i)).year}-{(now - relativedelta(months=i)).month:02d}"
        for i in range(months - 1, -1, -1)
    ]

    oldest = now - relativedelta(months=months - 1)
    start  = datetime(oldest.year, oldest.month, 1, tzinfo=timezone.utc)
    end    = datetime(now.year, now.month, 1, tzinfo=timezone.utc) + relativedelta(months=1) - timedelta(seconds=1)

    query = QueryDefinition(
        type="ActualCost",
        timeframe=TimeframeType.CUSTOM,
        time_period=QueryTimePeriod(from_property=start, to=end),
        dataset=QueryDataset(
            granularity="Monthly",
            aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
            grouping=[QueryGrouping(type="Dimension", name="ResourceId")],
        ),
    )

    monthly_map: Dict[str, Dict[str, float]] = {}

    for sub_id in sub_ids:
        scope = f"/subscriptions/{sub_id}"
        try:
            response = _query_with_retry(client, scope, query)
            if not response or not response.rows:
                continue

            col_names = [c.name for c in response.columns]
            cost_idx  = col_names.index("Cost")
            rid_idx   = col_names.index("ResourceId")
            date_idx  = next(
                (i for i, c in enumerate(response.columns)
                 if "date" in c.name.lower() or "month" in c.name.lower()),
                None,
            )

            while True:
                for row in response.rows:
                    rid      = str(row[rid_idx]).lower().strip()
                    cost     = float(row[cost_idx])
                    # Monthly granularity returns YYYYMMDD as integer (first of month)
                    date_raw = str(int(row[date_idx])) if date_idx is not None else ""
                    month_key = f"{date_raw[:4]}-{date_raw[4:6]}" if len(date_raw) >= 6 else date_raw[:7]
                    if rid and month_key in month_keys:
                        monthly_map.setdefault(rid, {})
                        monthly_map[rid][month_key] = monthly_map[rid].get(month_key, 0.0) + cost

                token = _extract_skiptoken(getattr(response, "next_link", None))
                if not token:
                    break
                response = _query_with_retry(client, scope, query, skiptoken=token)

        except Exception as exc:
            logger.warning("[%s] Monthly cost history query failed: %s", sub_id, exc)

    return {
        rid: [month_costs.get(mk, 0.0) for mk in month_keys]
        for rid, month_costs in monthly_map.items()
    }


def get_total_daily_costs(
    subscription_ids: Optional[List[str]] = None,
) -> Tuple[List[float], List[float]]:
    """
    Returns (curr_month_daily_totals, prev_month_daily_totals) as flat arrays.

    Queries daily costs aggregated by date only — no ResourceId grouping — so the
    response is at most ~62 rows (prev month + current month to today).  This avoids
    the 1 000-row pagination problem that truncates per-resource daily data.
    """
    credential = get_credential()
    sub_ids    = subscription_ids or get_subscription_ids()
    client     = CostManagementClient(credential)

    now   = datetime.now(tz=timezone.utc)
    today = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)

    # Span: start of previous calendar month → end of today
    first_of_prev = datetime(now.year, now.month, 1, tzinfo=timezone.utc) - relativedelta(months=1)
    end            = datetime(now.year, now.month, now.day, 23, 59, 59, tzinfo=timezone.utc)

    query = QueryDefinition(
        type="ActualCost",
        timeframe=TimeframeType.CUSTOM,
        time_period=QueryTimePeriod(from_property=first_of_prev, to=end),
        dataset=QueryDataset(
            granularity="Daily",
            aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
            # No grouping → daily grand-total, one row per day (~62 rows max)
        ),
    )

    by_date: Dict[str, float] = {}

    for sub_id in sub_ids:
        scope = f"/subscriptions/{sub_id}"
        try:
            response = _query_with_retry(client, scope, query)
            if not response or not response.rows:
                continue

            col_names = [c.name for c in response.columns]
            cost_idx  = next(
                (col_names.index(c) for c in ("Cost", "totalCost", "PreTaxCost") if c in col_names),
                None,
            )
            date_idx  = next(
                (i for i, c in enumerate(response.columns) if "date" in c.name.lower()),
                None,
            )
            if cost_idx is None or date_idx is None:
                logger.warning("[%s] Total daily cost: unexpected columns %s", sub_id, col_names)
                continue

            for row in response.rows:
                cost     = float(row[cost_idx])
                date_val = str(row[date_idx])
                if len(date_val) == 8 and date_val.isdigit():
                    date_str = f"{date_val[:4]}-{date_val[4:6]}-{date_val[6:8]}"
                else:
                    date_str = date_val[:10]
                if date_str:
                    by_date[date_str] = by_date.get(date_str, 0.0) + cost

        except Exception as exc:
            logger.warning("[%s] Total daily cost query failed: %s", sub_id, exc)

    # Build same shape as _month_daily_arrays but using the aggregated data
    curr = [
        round(by_date.get(f"{now.year}-{now.month:02d}-{day:02d}", 0.0), 4)
        for day in range(1, today.day + 1)
    ]

    first_of_this = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    last_of_prev  = first_of_this - timedelta(days=1)
    pv_year, pv_month, days_in_prev = last_of_prev.year, last_of_prev.month, last_of_prev.day
    prev = [
        round(by_date.get(f"{pv_year}-{pv_month:02d}-{day:02d}", 0.0), 4)
        for day in range(1, days_in_prev + 1)
    ]

    logger.info(
        "Total daily costs: %d days curr, %d days prev, %.2f curr total, %.2f prev total",
        len(curr), len(prev), sum(curr), sum(prev),
    )
    return curr, prev


def get_daily_costs(
    days: int = 60,
    subscription_ids: Optional[List[str]] = None,
) -> Dict[str, list]:
    """
    Returns {resource_id_lower: [(date_str, cost), ...]} for the last N days,
    aggregated across all subscriptions.
    """
    credential = get_credential()
    sub_ids    = subscription_ids or get_subscription_ids()
    client     = CostManagementClient(credential)

    now   = datetime.now(tz=timezone.utc)
    start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc) - timedelta(days=days)
    end   = datetime(now.year, now.month, now.day, 23, 59, 59, tzinfo=timezone.utc)

    query = QueryDefinition(
        type="ActualCost",
        timeframe=TimeframeType.CUSTOM,
        time_period=QueryTimePeriod(from_property=start, to=end),
        dataset=QueryDataset(
            granularity="Daily",
            aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
            grouping=[QueryGrouping(type="Dimension", name="ResourceId")],
        ),
    )

    # Accumulate: {rid: {date_str: cost}}
    daily_map: Dict[str, Dict[str, float]] = {}

    for sub_id in sub_ids:
        scope = f"/subscriptions/{sub_id}"
        try:
            response = _query_with_retry(client, scope, query)
            if not response or not response.rows:
                continue

            col_names = [c.name for c in response.columns]
            cost_idx  = col_names.index("Cost")
            rid_idx   = col_names.index("ResourceId")
            date_idx  = next(
                (i for i, c in enumerate(response.columns) if "date" in c.name.lower()),
                None,
            )

            # Azure Cost Management caps responses at 1 000 rows and paginates via
            # next_link. Without following the link, resources past the cutoff get
            # zero daily data and appear flat on the trend graph.
            while True:
                for row in response.rows:
                    rid      = str(row[rid_idx]).lower().strip()
                    cost     = float(row[cost_idx])
                    date_val = str(row[date_idx]) if date_idx is not None else ""
                    if len(date_val) == 8 and date_val.isdigit():
                        date_str = f"{date_val[:4]}-{date_val[4:6]}-{date_val[6:8]}"
                    else:
                        date_str = date_val[:10]
                    if rid:
                        daily_map.setdefault(rid, {})
                        daily_map[rid][date_str] = daily_map[rid].get(date_str, 0.0) + cost

                token = _extract_skiptoken(getattr(response, "next_link", None))
                if not token:
                    break
                response = _query_with_retry(client, scope, query, skiptoken=token)

        except Exception as exc:
            logger.warning("[%s] Daily cost query failed: %s", sub_id, exc)

    # Convert to sorted list of tuples
    result: Dict[str, list] = {
        rid: sorted(dates.items())
        for rid, dates in daily_map.items()
    }
    return result
