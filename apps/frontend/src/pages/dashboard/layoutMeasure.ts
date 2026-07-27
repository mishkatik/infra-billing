/** Ignore ResizeObserver echoes right after we change layout (browser zoom thrash). */
export function createLayoutGate() {
  let ignore = false;
  return {
    shouldSkip() {
      return ignore;
    },
    afterChange() {
      ignore = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          ignore = false;
        });
      });
    },
  };
}
