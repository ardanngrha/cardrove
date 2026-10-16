type Key = Pick<
  KeyboardEvent,
  'key' | 'code' | 'repeat' | 'isComposing' | 'ctrlKey' | 'metaKey' | 'altKey' | 'defaultPrevented'
>;
export function studyShortcut(
  event: Key,
  context: {
    reviewing: boolean;
    revealed: boolean;
    blocked: boolean;
    editing: boolean;
    nativeActivation: boolean;
  },
): 'reveal' | 1 | 2 | 3 | 4 | null {
  if (
    !context.reviewing ||
    context.blocked ||
    context.editing ||
    event.repeat ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.defaultPrevented
  )
    return null;
  if (context.revealed && /^[1-4]$/.test(event.key)) return Number(event.key) as 1 | 2 | 3 | 4;
  if (
    !context.revealed &&
    !context.nativeActivation &&
    (event.code === 'Space' || event.key === ' ' || event.key === 'Enter')
  )
    return 'reveal';
  return null;
}
