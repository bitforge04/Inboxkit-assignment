import { uniqueNamesGenerator, adjectives, animals } from 'unique-names-generator';

export function generateDisplayName(): string {
  const name = uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    separator: ' ',
    style: 'capital',
  });
  const suffix = Math.floor(Math.random() * 99) + 1;
  return `${name} ${suffix}`;
}
