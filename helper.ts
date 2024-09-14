export function extractDigits(input: string): string {
  const digits = input.match(/\d+/g); // \d+ matches one or more digits
  return digits ? digits.join("") : "";
}

export function getRandomNumber(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}