---
name: web-design-guidelines
description: MANDATORY review of UI code for Web Interface Guidelines compliance. YOU MUST use this when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices". Audit rigorously.
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

> PROACTIVELY audit files for compliance with Web Interface Guidelines.

## How It Works

1. **Fetch** the latest guidelines from the source URL below.
2. **Read** the specified files (or prompt user for files/pattern).
3. **Verify** against ALL rules in the fetched guidelines.
4. **Report** findings in the terse `file:line` format.

## Guidelines Source

Fetch fresh guidelines before EVERY review:

```text
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

Use `read_url_content` to retrieve the latest rules. The fetched content contains all the rules and output format instructions.

## Usage

When a user provides a file or pattern argument:

1. **Fetch** guidelines from the source URL above.
2. **Analyze** the specified files.
3. **Apply** ALL rules from the fetched guidelines.
4. **Output** findings using the format specified in the guidelines.

If no files specified, ASK the user which files to review.

---

---

## Design Workflow

```text
1. CODE     → Implement the design
2. AUDIT    → Run web-design-guidelines review ← YOU ARE HERE
3. FIX      → Address findings from audit
```

## 🏛️ Local Project Addendum

### 1. Visual Content Integrity

- **Emoji Duplication**: Check that dynamic icons (e.g. `{{ event.icon }}`) are not rendered alongside text labels that already contain hardcoded emojis.
- **Rule**: If a label contains its own emoji (e.g., "⚡ EXP"), suppress the general icon for that specific list item to avoid visual noise.
- **Emoji Spacing**: Emojis in buttons or text labels MUST have adequate spacing (e.g., `gap: 8px` or `margin-right`) to avoid being visually cramped against the adjacent text.
- **Action Tooltips**: All interactive buttons that use only icons (e.g., in Social Center or Inventories) MUST be wrapped in the `PVTooltip` component to provide clear contextual descriptions on hover.
- **Informative Blocked States**: Locked UI elements (like routes, buttons, or areas) MUST explain the specific reason for the lock via tooltips. Avoid generic "Locked" or "Blocked" messages. If a specific requirement (e.g., medals, items, level) is missing, state it clearly to guide the user on how to unlock it.
- **Selection Indicator Placement**: Multi-selection indicators (checks, toggles) SHOULD be placed in the **bottom-right** corner of cards or slots to avoid overlapping with Tier/Rank badges (usually in the top-right).
- **Mass Operation Feedback**: Always provide success notifications after batch operations (mass release, mass sell) detailing the quantitative results, such as the total money earned or the number of items processed.
- **Drag-and-Drop Interaction Priority**: Draggable elements (team slots, moves) MUST prioritize the "grab" intent.
  - **Cursor**: Use `cursor: grab` on hover and `cursor: grabbing` while active.
  - **Click Interdiction**: Disable or interdict general clicks (like navigating to details) while an element is being dragged (`isDragging`). Detail actions should be delegated to dedicated buttons (e.g., "DATOS") to avoid ambiguous user intent.
