---
name: CSS layout approach
description: Prefer flexbox over absolute positioning for icon/element alignment
type: feedback
---

Use flexbox siblings for icon+input patterns instead of absolute positioning. Absolute positioning inside flex containers causes unpredictable behavior when the container resizes.

**Why:** Multiple failed attempts at centering a search icon with `absolute left-X top-1/2 -translate-y-1/2` — the icon appeared skewed because the flex container was collapsing. Switching to `flex items-center gap-2` with the icon as a flex sibling fixed it immediately.

**How to apply:** When placing an icon inside or beside an input field, wrap both in a `flex items-center` container and make the icon a flex child, not an absolutely positioned element.
