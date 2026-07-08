export function formatCurrency(value: number, fractionDigits = 0) {
  return `${value.toLocaleString("ru-RU", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} ₸`;
}

export function formatQuantity(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

let windows1251ReverseMap: Map<string, number> | null = null;

function getWindows1251ReverseMap() {
  if (windows1251ReverseMap) return windows1251ReverseMap;

  const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
  const characters = new TextDecoder("windows-1251").decode(bytes);
  windows1251ReverseMap = new Map(
    Array.from(characters, (character, index) => [character, index]),
  );
  return windows1251ReverseMap;
}

export function repairTextEncoding(value: string) {
  try {
    const reverseMap = getWindows1251ReverseMap();
    const bytes = Array.from(value, (character) => reverseMap.get(character));
    if (bytes.some((byte) => byte === undefined)) return value;

    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(bytes as number[]),
    );
  } catch {
    return value;
  }
}
