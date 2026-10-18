export function normalizePhone(value: string) {
  const digitsOnly = value.replace(/\D+/g, "");

  if (!digitsOnly) {
    return "";
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith("8")) {
    return `7${digitsOnly.slice(1)}`;
  }

  if (digitsOnly.length === 10) {
    return `7${digitsOnly}`;
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith("7")) {
    return digitsOnly;
  }

  return digitsOnly;
}

export function isNormalizedPhone(value: string) {
  return /^7\d{10}$/.test(value);
}

export function formatPhoneInput(value: string) {
  const digitsOnly = value.replace(/\D+/g, "");

  if (!digitsOnly) {
    return "";
  }

  let normalizedDigits = digitsOnly;

  if (normalizedDigits.startsWith("8")) {
    normalizedDigits = `7${normalizedDigits.slice(1)}`;
  } else if (!normalizedDigits.startsWith("7") && !normalizedDigits.startsWith("9")) {
    normalizedDigits = normalizedDigits.slice(0, 11);
  } else if (normalizedDigits.startsWith("9")) {
    normalizedDigits = `7${normalizedDigits}`;
  }

  const trimmed = normalizedDigits.slice(0, 11);

  if (!trimmed.startsWith("7")) {
    return trimmed;
  }

  const national = trimmed.slice(1);
  const areaCode = national.slice(0, 3);
  const partOne = national.slice(3, 6);
  const partTwo = national.slice(6, 8);
  const partThree = national.slice(8, 10);

  let formatted = "+7";

  if (areaCode.length > 0) {
    formatted += ` (${areaCode}`;
    if (areaCode.length === 3) {
      formatted += ")";
    }
  }

  if (partOne.length > 0) {
    formatted += `${areaCode.length === 3 ? " " : ""}${partOne}`;
  }

  if (partTwo.length > 0) {
    formatted += `-${partTwo}`;
  }

  if (partThree.length > 0) {
    formatted += `-${partThree}`;
  }

  return formatted;
}
