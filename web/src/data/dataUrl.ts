/** The address of a file in the data folder that `make data` writes (web/public/data/). */
export function dataUrl(file: string): string {
  return `${import.meta.env.BASE_URL}data/${file}`;
}
