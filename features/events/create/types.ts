import type { UseFormReturn } from 'react-hook-form';

import type { TranslationKey } from '@/i18n';
import type { EventInput } from '@/utils/validators';

/** Every step gets the whole form object. They each touch two or three
 *  fields, but `control`, `watch` and `setValue` are needed together and
 *  threading them individually was noisier than passing the handle. */
export type StepProps = {
  form: UseFormReturn<EventInput>;
};

export type StepId = 'basics' | 'style' | 'details' | 'when' | 'where' | 'finish';

export type StepDef = {
  id: StepId;
  /** Name shown top-right in the progress header. */
  name: TranslationKey;
  title: TranslationKey;
  hint: TranslationKey;
  /** Validated by `trigger()` before the step will let you continue. */
  fields: readonly (keyof EventInput)[];
};

/** The wizard, in order.
 *
 *  Grouping rule: one decision per step. Title+emoji is a single
 *  decision ("what is this?"), date+time is one ("when?"). Location gets
 *  a step to itself because it can bounce out to the map and back, and
 *  the last step is the only one that shows everything at once — with
 *  the form split up, the user can no longer see what they typed three
 *  screens ago, so they get a summary before it goes live.
 *
 *  `style` is the odd one out: it only exists for accounts entitled to
 *  a premium pin, and `buildSteps` drops it for everyone else. It sits
 *  right after `basics` because that is where the pin preview already
 *  lives — colour and effect are the same decision as emoji, continued. */
const ALL_STEPS: readonly StepDef[] = [
  {
    id: 'basics',
    name: 'createEvent.stepBasics',
    title: 'createEvent.basicsTitle',
    hint: 'createEvent.basicsHint',
    fields: ['title', 'emoji'],
  },
  {
    id: 'style',
    name: 'createEvent.stepStyle',
    title: 'createEvent.styleTitle',
    hint: 'createEvent.styleHint',
    fields: ['pin_color', 'pin_effect'],
  },
  {
    id: 'details',
    name: 'createEvent.stepDetails',
    title: 'createEvent.detailsTitle',
    hint: 'createEvent.detailsHint',
    fields: ['description', 'tags'],
  },
  {
    id: 'when',
    name: 'createEvent.stepWhen',
    title: 'createEvent.whenTitle',
    hint: 'createEvent.whenHint',
    fields: ['event_date', 'event_time'],
  },
  {
    id: 'where',
    name: 'createEvent.stepWhere',
    title: 'createEvent.whereTitle',
    hint: 'createEvent.whereHint',
    fields: ['latitude', 'longitude', 'address'],
  },
  {
    id: 'finish',
    name: 'createEvent.stepFinish',
    title: 'createEvent.finishTitle',
    hint: 'createEvent.finishHint',
    fields: ['max_participants', 'visibility'],
  },
];

/** Six steps for premium and staff, five for everyone else.
 *
 *  Memoise the result — it is compared by identity in the sheet's step
 *  bookkeeping, and a fresh array every render would defeat that. */
export function buildSteps(canStyle: boolean): readonly StepDef[] {
  return canStyle ? WITH_STYLE : WITHOUT_STYLE;
}

const WITH_STYLE = ALL_STEPS;
const WITHOUT_STYLE = ALL_STEPS.filter((s) => s.id !== 'style');

/** Index of a step in a particular wizard, by id. The location step
 *  needs one for the "you haven't dropped a pin" guard, which zod can't
 *  express (0,0 is a valid coordinate as far as the schema knows), and
 *  the summary rows need one each to jump back. Returns 0 rather than -1
 *  for an id that isn't in this wizard, so a jump can never land the
 *  user off the end. */
export function stepIndex(steps: readonly StepDef[], id: StepId): number {
  const i = steps.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}
