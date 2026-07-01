export function compareRoomName(first: string, second: string) {
  const firstTrimmed = first.trim();
  const secondTrimmed = second.trim();
  const firstIsNumber = /^\d+$/.test(firstTrimmed);
  const secondIsNumber = /^\d+$/.test(secondTrimmed);
  const firstNumber = firstIsNumber ? Number(firstTrimmed) : 0;
  const secondNumber = secondIsNumber ? Number(secondTrimmed) : 0;
  if (firstIsNumber && secondIsNumber && firstNumber !== secondNumber) return firstNumber - secondNumber;
  if (firstIsNumber !== secondIsNumber) return firstIsNumber ? -1 : 1;
  return first.localeCompare(second, "th", { numeric: true, sensitivity: "base" });
}
