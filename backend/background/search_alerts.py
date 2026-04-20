"""
Background job: re-run saved searches and email alerts for new matches.
Scheduled via APScheduler every 6 hours.
"""
import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from ..database import AsyncSessionLocal
from ..models.search import SavedSearch
from ..models.user import User
from ..services.property_service import search_properties
from ..services.alert_service import send_saved_search_alert


async def run_saved_search_alerts() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SavedSearch).where(SavedSearch.alert_enabled.is_(True))
        )
        searches = result.scalars().all()

        for saved in searches:
            try:
                user_result = await db.execute(
                    select(User).where(User.id == saved.user_id)
                )
                user = user_result.scalar_one_or_none()
                if not user or not user.email:
                    continue

                criteria = saved.criteria or {}
                properties = await search_properties(
                    db,
                    query=criteria.get("query"),
                    min_deal_score=criteria.get("min_deal_score"),
                    max_price=criteria.get("max_price"),
                    min_cap_rate=criteria.get("min_cap_rate"),
                    property_types=criteria.get("property_types"),
                    sort_by=criteria.get("sort_by"),
                )

                all_ids = [p.id for p in properties]
                prev_ids = set(saved.last_notified_property_ids or [])
                new_ids = [pid for pid in all_ids if pid not in prev_ids]

                if new_ids:
                    new_props = [
                        {
                            "id": p.id,
                            "address": p.address,
                            "city": p.city,
                            "state": p.state,
                            "zip": p.zip,
                            "price": p.price,
                            "deal_score": p.deal_score,
                            "cap_rate": p.cap_rate,
                            "cash_flow": p.cash_flow,
                        }
                        for p in properties
                        if p.id in set(new_ids)
                    ]
                    await send_saved_search_alert(
                        user_email=user.email,
                        search_name=saved.name or "My Search",
                        properties=new_props,
                    )
                    saved.last_notified_property_ids = list(set(prev_ids) | set(new_ids))

                saved.last_run_at = datetime.now(timezone.utc)
                await db.flush()

            except Exception:
                continue
