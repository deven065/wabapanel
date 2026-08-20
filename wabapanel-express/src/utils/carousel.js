// Builds the send-time carousel component for an approved carousel template.
function buildCarouselComponent(cards) {
  return {
    type: 'carousel',
    cards: cards.map((c, i) => {
      const mediaType = c.mediaType || 'image';
      const comps = [
        { type: 'header', parameters: [{ type: mediaType, [mediaType]: { link: c.mediaUrl } }] },
      ];
      (c.buttons || []).forEach((b, bi) => {
        if (b.type === 'quick_reply') {
          comps.push({ type: 'button', sub_type: 'quick_reply', index: bi, parameters: [{ type: 'payload', payload: `${b.text || 'btn'}_${i}_${bi}` }] });
        }
      });
      return { card_index: i, components: comps };
    }),
  };
}

module.exports = { buildCarouselComponent };
