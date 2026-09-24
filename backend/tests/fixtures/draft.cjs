const fixture = require('./card.json');

function makeDraft(overrides = {}) {
  const draft = structuredClone(fixture);
  delete draft.slug;

  for (const value of Object.values(draft)) {
    if (value && typeof value === 'object' && 'enabled' in value) {
      value.value = '';
      value.enabled = false;
    }
  }

  for (const field of Object.values(draft.messengers)) {
    field.value = '';
    field.enabled = false;
  }

  return {
    ...draft,
    firstName: 'Иван',
    lastName: 'Иванов',
    ...overrides,
  };
}

module.exports = { makeDraft };
