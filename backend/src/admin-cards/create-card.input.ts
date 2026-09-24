import { createCardSlug } from './card-slug.utils';
import { checkAllowedKeys, readDraftInput, requireObject } from './card-draft.input';

export function readNewCard(body: unknown) {
  const data = requireObject(body);
  checkAllowedKeys(data, ['draft']);
  const draft = readDraftInput(data.draft);

  return {
    // Адрес создаётся один раз: изменение имени не должно ломать ссылки и QR.
    slug: createCardSlug(draft.lastName, draft.firstName),
    draft,
  };
}
