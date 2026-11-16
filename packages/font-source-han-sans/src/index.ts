/** Where the Source Han Sans JP font files are, one per weight. Read the bytes with `fetch` or `fs`. */
export const sourceHanSansJP = {
  regular: new URL("../fonts/SourceHanSansJP-Regular.otf", import.meta.url),
  bold: new URL("../fonts/SourceHanSansJP-Bold.otf", import.meta.url),
};
