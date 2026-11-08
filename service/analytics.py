"""Exact snapshot analytics over a validated retrieval result; never model SQL."""
from __future__ import annotations

import datetime as dt

from .retrieval import BEIJING, InputError
from .text import phrase

DIMENSIONS = frozenset({"institution", "angle", "platform", "month"})
DATE_FIELDS = frozenset({"published_at", "published_effective_at", "collected_at"})


def build_analytics(retriever, result: dict, dimensions=None) -> dict:
    """Aggregate distinct matching records under the actual search plan.

    result must be Retriever/SearchEngine.search output. Scope/terms/exclusions
    come from its plan, never rewritten model text. Dimensions are allowlisted.
    by_month uses Beijing calendar months of the selected original/recovered/
    collection field and reports undated/future records separately.
    """
    if not isinstance(result, dict) or not isinstance(result.get("plan"), dict):
        raise InputError("analytics requires a retrieval result")
    if dimensions is None:
        dimensions = ["institution", "angle", "platform", "month"]
    if not isinstance(dimensions, (list, tuple)) or not dimensions or any(not isinstance(item, str) or item not in DIMENSIONS for item in dimensions):
        raise InputError("analytics dimensions must be institution, angle, platform, or month")
    dimensions = list(dict.fromkeys(dimensions))
    plan = result["plan"]
    raw_filters = plan.get("filters", {})
    filters = retriever.validate_filters({key: value for key, value in raw_filters.items() if key != "record_ids"})
    if "record_ids" in raw_filters:
        ids = raw_filters["record_ids"]
        if not isinstance(ids, list) or len(ids) > 30 or any(not isinstance(value, str) for value in ids):
            raise InputError("Invalid analytics internal record scope")
        filters["record_ids"] = ids
    date_field = filters.get("date_field", "published_at")
    if date_field not in DATE_FIELDS:
        raise InputError("Invalid analytics date field")
    terms = plan.get("terms", [])
    if not isinstance(terms, list) or len(terms) > 12 or any(not isinstance(group, list) or not group or len(group) > 16 or any(not isinstance(term, str) or len(term) > 1200 for term in group) for group in terms):
        raise InputError("Invalid analytics term groups")
    conjunction = " OR " if plan.get("relaxed") else " AND "
    match = conjunction.join("(" + " OR ".join(phrase(term) for term in group) + ")" for group in terms)
    exclusions = plan.get("excluded_terms", [])
    if not isinstance(exclusions, list) or len(exclusions) > 30 or any(not isinstance(term, str) or len(term) > 1200 for term in exclusions):
        raise InputError("Invalid analytics exclusion terms")
    excluded_match = " OR ".join(phrase(term) for term in exclusions)
    where, params = retriever._record_condition(filters, match, excluded_match)
    as_of = plan.get("time_scope", {}).get("as_of")
    try:
        now = dt.datetime.fromisoformat(as_of).astimezone(dt.timezone.utc)
    except (TypeError, ValueError):
        now = dt.datetime.now(dt.timezone.utc)
    scope = dict(result.get("aggregates", {}).get("scope", {}))
    scope.update(dataset="real", filters=dict(filters), source_version=retriever.snapshot["source_version"],
                 date_field=date_field, timezone="Asia/Shanghai", term_match=terms,
                 excluded_terms=exclusions, strategy=plan.get("strategy", "structured_filters"),
                 dimensions=dimensions, as_of=now.astimezone(BEIJING).isoformat(timespec="seconds"),
                 date_basis="Verified recovered publication dates included" if date_field == "published_effective_at"
                 else "Source collection/discovery timestamps" if date_field == "collected_at"
                 else "Original source publication field only; recovered dates do not replace it")
    with retriever.connect() as con:
        # Existing aggregate grouping counts each row in the UNION ALL records
        # view once; record IDs are unique in the ingested real snapshot.
        matched = retriever._aggregates(con, filters, match, excluded_match)
        date_rows = con.execute(f"SELECT r.id,r.{date_field} AS date_value,r.date_origin,r.date_verified FROM records r WHERE " + where, params).fetchall()
    by_month, dated, nonfuture, future, origins = {}, [], [], 0, {}
    for row in date_rows:
        origin = row["date_origin"] or "missing"
        origins[origin] = origins.get(origin, 0) + 1
        if not row["date_value"]:
            continue
        try:
            value = dt.datetime.fromisoformat(row["date_value"].replace("Z", "+00:00"))
            if value.tzinfo is None:
                value = value.replace(tzinfo=dt.timezone.utc)
        except ValueError:
            continue
        local = value.astimezone(BEIJING)
        month = local.strftime("%Y-%m")
        by_month[month] = by_month.get(month, 0) + 1
        dated.append(value.astimezone(dt.timezone.utc).isoformat(timespec="seconds"))
        future += value > now
        if value <= now:
            nonfuture.append(value.astimezone(dt.timezone.utc).isoformat(timespec="seconds"))
    output = {"scope": scope, "matched": matched, "total": matched["total"],
              "by_month": [{"month": month, "count": count} for month, count in sorted(by_month.items())] if "month" in dimensions else [],
              "date_range": {"date_field": date_field, "timezone": "Asia/Shanghai", "basis": scope["date_basis"],
                             "min": min(dated) if dated else None, "max": max(dated) if dated else None,
                             "max_nonfuture": max(nonfuture) if nonfuture else None,
                             "dated_records": len(dated), "undated_records": matched["total"] - len(dated),
                             "future_dated_records": future, "date_origins": origins},
              "by_institution": matched["by_institution"] if "institution" in dimensions else [],
              "by_angle": matched["by_angle"] if "angle" in dimensions else {},
              "by_platform": matched["by_platform"] if "platform" in dimensions else [],
              "method": "parameterized_readonly_sql_distinct_records",
              "warning": "Counts describe records in the stored real snapshot. Monthly record volume is not a measure of institutional stance or web-wide attention."}
    # Shares are exact database arithmetic with an explicit denominator, never
    # a model estimate and never a measure of influence or institutional activity.
    total = matched["total"]
    def share(value):
        return round(value * 100 / total, 4) if total else None
    output["shares"] = {"denominator": total, "basis": "matched_records_within_current_filters_and_terms",
                        "unit": "percent", "by_institution": [{"ktid": item["ktid"], "count": item["count"], "percent": share(item["count"])} for item in output["by_institution"]],
                        "by_angle": [{"angle": angle, "count": count, "percent": share(count)} for angle, count in output["by_angle"].items()],
                        "by_platform": [{"platform": item["platform"], "count": item["count"], "percent": share(item["count"])} for item in output["by_platform"]]}
    intent = plan.get("intent", plan.get("request_intent", {}))
    if intent.get("operations", {}).get("ranking"):
        dimension = intent.get("ranking_dimension", "institution")
        source = output["by_platform"] if dimension == "platform" else output["by_institution"]
        ascending = intent.get("ranking") == "ascending"
        ranked = sorted(source, key=lambda item: item["count"], reverse=not ascending)
        output["ranking"] = {"dimension": dimension, "order": "ascending" if ascending else "descending",
                             "metric": "matched_record_count", "denominator": total, "ties_included": True,
                             "entries": [item for item in ranked if ranked and item["count"] == ranked[0]["count"]]}
    if "scoped" in result.get("aggregates", {}):
        output["scoped"] = result["aggregates"]["scoped"]
    return output
