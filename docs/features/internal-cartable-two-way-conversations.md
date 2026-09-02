# Internal cartable two-way conversations

## Scope

Internal administrative messages exchanged by managers and employees through
the cartable. Customer and agency support tickets remain outside this flow.

## Acceptance checklist

- [x] Every active staff account can select and directly message every other
      active staff account; customer and agency accounts are never recipients.
- [x] A manager or employee receiving an internal message can reply to its
      original sender without role- or department-specific restrictions.
- [x] Sending a reply atomically closes the current incoming item and creates a
      new OPEN cartable item for the other participant.
- [x] Every direct conversation has a stable identifier. Broadcast delivery
      creates an independent conversation per recipient so one recipient's
      replies are not visible to other recipients.
- [x] Opening any item in a conversation returns the complete chronological
      message history, including attachment metadata, for that conversation.
- [x] Closing an item never deletes its conversation; resolved rows remain
      available through status filters and remain searchable in the cartable.
- [x] Only the sender or assignee of a conversation may read its history, and
      only the current assignee of an OPEN item may reply.
- [x] Replies and direct messages validate attachment ownership and notify the
      recipient.
- [x] Existing approval, rejection, transfer, referral, chair-permission, and
      agency-request workflows keep their existing behavior.
- [x] Backend e2e coverage proves IT manager -> finance manager -> IT manager
      reply, history retention after closure, staff-wide recipient discovery,
      and rejection of external recipients.
- [x] Frontend coverage proves the reply control submits the message and the
      closed conversation remains viewable.

## UX rule

An internal message is not a support ticket. The receiver sees **پاسخ و
بستن** for an OPEN internal message. The reply becomes the other participant's
new OPEN item. Closed items expose the same history in read-only mode.
