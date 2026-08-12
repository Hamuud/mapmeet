import type { UseFormReturn } from 'react-hook-form';

import type { TranslationKey } from '@/i18n';
import type { EventInput } from '@/utils/validators';

/** Every step gets the whole form object. They each touch two or three
 *  fields, but `control`, `watch` and `setValue` are needed together and
 *  threading them individually was noisier than passing the handle. */
export type StepProps = {
  form: UseFormReturn<EventInput>;
};

export type StepDef = {
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
 *  screens ago, so they get a summary before it goes live. */
export const STEPS = [
  {
    name: 'createEvent.stepBasics',
    title: 'createEvent.basicsTitle',
    hint: 'createEvent.basicsHint',
    fields: ['title', 'emoji'],
  },
  {
    name: 'createEvent.stepDetails',
    title: 'createEvent.detailsTitle',
    hint: 'createEvent.detailsHint',
    fields: ['description', 'tags'],
  },
  {
    name: 'createEvent.stepWhen',
    title: 'createEvent.whenTitle',
    hint: 'createEvent.whenHint',
    fields: ['event_date', 'event_time'],
  },
  {
    name: 'createEvent.stepWhere',
    title: 'createEvent.whereTitle',
    hint: 'createEvent.whereHint',
    fields: ['latitude', 'longitude', 'address'],
  },
  {
    name: 'createEvent.stepFinish',
    title: 'createEvent.finishTitle',
    hint: 'createEvent.finishHint',
    fields: ['max_participants', 'visibility'],
  },
  // `as const satisfies` and not a plain annotation: the tuple type is
  // what makes `STEPS[0]` known-defined under noUncheckedIndexedAccess,
  // which is the fallback the sheet clamps to.
] as const satisfies readonly StepDef[];

export const STEP_COUNT = STEPS.length;

/** Index of the location step — the orchestrator needs it for the
 *  "you haven't dropped a pin" guard, which zod can't express (0,0 is a
 *  valid coordinate as far as the schema is concerned). */
export const WHERE_STEP = 3;
