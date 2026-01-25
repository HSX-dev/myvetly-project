export function recursivelyStripNullValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(recursivelyStripNullValues);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => [
        key,
        recursivelyStripNullValues(value),
      ]),
    );
  }
  if (value !== null) {
    return value;
  }
}

export function cleanValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cleanValue);
  } else if (value !== null && typeof value === 'object') {
    const object: any = value;
    for (const [key, val] of Object.entries(object)) {
      if (key == 'password') {
        object[key] = undefined;
      } else if (val == null) {
        object[key] = undefined;
      } else if (typeof val == 'object') {
        object[key] = cleanValue(val);
      }
    }
    return object;
  } else if (value == null) {
    return undefined;
  } else {
    return value;
  }
}

export default cleanValue;

