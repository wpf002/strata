"""
Copilot router — streams Claude responses via Server-Sent Events.
"""
import json
from typing import AsyncGenerator

import anthropic
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..config import get_settings
from ..services import property_service

router = APIRouter(prefix="/copilot")

_SYSTEM_BASE = """You are STRATA Copilot, an AI real estate intelligence assistant.
You help investors, agents, and buyers make better real estate decisions.

Rules you must follow:
- All financial figures are estimates, not investment advice
- Every specific claim about a property must reference the data provided
- If asked about data not in your context, say you don't have it — never fabricate numbers
- Add confidence labels to all projections
- Never recommend a specific investment without qualifying assumptions
- When a property is in context, ground every answer in that data"""

_PROPERTY_CONTEXT_TEMPLATE = """
Property in context:
Address: {address}
Price: {price}
Beds/Baths/Sqft: {beds}/{baths}/{sqft}
Deal Score: {deal_score}
Risk Score: {risk_score}
Cap Rate: {cap_rate}%
Est. Cash Flow: ${cash_flow}/mo
Fair Value Range: ${fair_value_low} - ${fair_value_high}
Rent Estimate: ${rent_est_mid}/mo ({rent_confidence} confidence)
Risk Flags: {risk_flags}
Market Regime: {market_regime}
"""


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    property_id: str | None = None


async def _stream_sse(chunks: AsyncGenerator[str, None]):
    async for text in chunks:
        yield f"data: {json.dumps({'text': text})}\n\n"
    yield "data: [DONE]\n\n"


@router.post("/chat")
async def chat(body: ChatRequest):
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="Anthropic API key not configured")

    system_prompt = _SYSTEM_BASE

    if body.property_id:
        prop = next(
            (p for p in property_service.MOCK_PROPERTIES if p["id"] == body.property_id),
            None,
        )
        if prop:
            flags = ", ".join(f["label"] for f in prop.get("risk_flags", [])) or "None"
            system_prompt = (
                _PROPERTY_CONTEXT_TEMPLATE.format(
                    address=prop["address"],
                    price=f"{prop['price']:,}",
                    beds=prop["beds"],
                    baths=prop["baths"],
                    sqft=f"{prop['sqft']:,}",
                    deal_score=prop["deal_score"],
                    risk_score=prop["risk_score"],
                    cap_rate=prop["cap_rate"],
                    cash_flow=prop["cash_flow"],
                    fair_value_low=f"{prop['fair_value_low']:,}",
                    fair_value_high=f"{prop['fair_value_high']:,}",
                    rent_est_mid=f"{prop['rent_est_mid']:,}",
                    rent_confidence=prop["rent_confidence"],
                    risk_flags=flags,
                    market_regime=prop.get("market_regime", "Unknown"),
                )
                + "\n\n"
                + _SYSTEM_BASE
            )

    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    async def generate():
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        async with client.messages.stream(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=system_prompt,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    return StreamingResponse(
        _stream_sse(generate()),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
