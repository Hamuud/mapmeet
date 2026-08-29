import { create } from 'zustand';

type ScrollLockState = {
  /** True while some control inside a scrolling sheet owns the gesture. */
  locked: boolean;
  setLocked: (locked: boolean) => void;
};

/** Lets a draggable control freeze the scroll view it is sitting in.
 *
 *  The colour picker's saturation/brightness square is a two-axis drag
 *  inside the create and edit sheets, both of which scroll. On iOS the
 *  scroll view's pan recogniser is native and competes with the JS
 *  responder system rather than deferring to it, so dragging down the
 *  square to lower the brightness scrolled the sheet at the same time.
 *  Claiming the responder on touch-down is not enough on its own;
 *  `scrollEnabled={false}` is what actually stops it.
 *
 *  A store rather than a callback threaded down through StepStyle,
 *  PinStyleField and PinColorField — three components that would each
 *  have to carry a prop for a scroll conflict none of them has any part
 *  in. One flag is fine here because only one sheet is ever open: the
 *  map screen closes the others before opening any of them.
 *
 *  Whatever sets this MUST clear it on release and on terminate, or the
 *  sheet stays frozen. */
export const useScrollLockStore = create<ScrollLockState>((set) => ({
  locked: false,
  setLocked: (locked) => set({ locked }),
}));
