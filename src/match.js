/**
 * Every string on a showtime that could carry the format, flattened. We match
 * across all of them because AMC exposes the format inconsistently between
 * `premiumFormat`, the attribute list, and the auditorium name.
 */
export function formatHaystack(st) {
  const parts = [
    st.premiumFormat,
    st.auditorium,
    st.auditoriumName,
    st.movieName,
    ...(Array.isArray(st.attributes)
      ? st.attributes.flatMap((a) => [a?.code, a?.name, a?.description])
      : []),
  ];
  return parts.filter(Boolean).join(' | ');
}

export function isTargetMovie(st, movieQuery) {
  const name = String(st.movieName || st.sortableMovieName || '').toLowerCase();
  return name.includes(movieQuery);
}

/**
 * IMAX 70mm. Requires an IMAX token AND a 70mm token, so plain IMAX Laser or a
 * generic 70mm print does not trigger. Overridable via FORMAT_PATTERN if the
 * `discover` dump shows AMC labelling it some other way.
 */
export function isImax70(st) {
  const hay = formatHaystack(st).toLowerCase();
  const override = process.env.FORMAT_PATTERN;
  if (override) return new RegExp(override, 'i').test(hay);
  return /imax/.test(hay) && /70\s*mm|\b70\b/.test(hay);
}

export function isCandidate(st, movieQuery) {
  return isTargetMovie(st, movieQuery) && isImax70(st) && !st.isCanceled;
}

/** True when a human could actually complete a purchase right now. */
export function isBuyable(st) {
  return Boolean(st.purchaseUrl) && !st.isSoldOut && !st.isCanceled;
}
