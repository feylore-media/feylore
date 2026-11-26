import JSZip from "jszip";

export interface MinimalEpubOptions {
  title?: string;
  subtitle?: string;
  authors?: string[];
  subjects?: string[];
  isbn?: string;
  withToc?: boolean;
  withMediaOverlay?: boolean;
  withCover?: boolean;
}

export async function buildMinimalEpub(
  options: MinimalEpubOptions = {},
): Promise<Buffer> {
  const title = options.title ?? "Test Book";
  const subtitle = options.subtitle;
  const authors = options.authors ?? [];
  const subjects = options.subjects ?? [];
  const isbn = options.isbn;
  const zip = new JSZip();

  const chapter = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${title}</title></head>
<body><p id="p1">Hello world</p></body>
</html>`;

  const nav = options.withToc
    ? `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Nav</title></head>
<body>
  <nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter</a></li></ol></nav>
</body>
</html>`
    : undefined;

  let smil: string | undefined;
  let overlayMeta = "";
  let spineOverlay = "";
  if (options.withMediaOverlay) {
    smil = `<?xml version="1.0" encoding="UTF-8"?>
<smil xmlns="http://www.w3.org/ns/SMIL">
  <body>
    <seq>
      <par><text src="chapter.xhtml#p1"/><audio src="audio.mp3" clipBegin="0s" clipEnd="2s"/></par>
    </seq>
  </body>
</smil>`;
    overlayMeta = `<meta property="media:active-class">-epub-media-overlay-active</meta>`;
    spineOverlay = ` media-overlay="overlay1"`;
    zip.file("audio.mp3", Buffer.from([0]));
  }

  const coverItem = options.withCover
    ? `<item id="cover" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>`
    : "";

  if (options.withCover) {
    zip.file("cover.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  }

  const navItem = nav
    ? `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`
    : "";

  const smilItem = smil
    ? `<item id="overlay1" href="overlay.smil" media-type="application/smil+xml"/>`
    : "";

  const authorMeta = authors
    .map((a) => `<dc:creator>${a}</dc:creator>`)
    .join("\n    ");
  const subjectMeta = subjects
    .map((s) => `<dc:subject>${s}</dc:subject>`)
    .join("\n    ");
  const isbnMeta = isbn
    ? `<dc:identifier id="isbn-id" opf:scheme="ISBN">${isbn}</dc:identifier>`
    : `<dc:identifier id="uid">test-id</dc:identifier>`;
  const subtitleMeta = subtitle ? `<dc:title>${subtitle}</dc:title>` : "";

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" xmlns:opf="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    ${subtitleMeta}
    ${isbnMeta}
    ${authorMeta}
    ${subjectMeta}
    <dc:description>A test description</dc:description>
    <dc:language>en</dc:language>
    ${overlayMeta}
  </metadata>
  <manifest>
    <item id="ch1" href="chapter.xhtml" media-type="application/xhtml+xml"${spineOverlay}/>
    ${coverItem}
    ${navItem}
    ${smilItem}
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`;

  zip.file(
    "mimetype",
    "application/epub+zip",
    { compression: "STORE" },
  );
  zip.file("META-INF/container.xml", `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
  zip.file("content.opf", opf);
  zip.file("chapter.xhtml", chapter);
  if (nav) zip.file("nav.xhtml", nav);
  if (smil) zip.file("overlay.smil", smil);

  return Buffer.from(await zip.generateAsync({ type: "arraybuffer" }));
}
