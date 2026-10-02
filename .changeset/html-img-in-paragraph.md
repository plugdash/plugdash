---
"@plugdash/fromghost": patch
"@plugdash/fromsubstack": patch
---

Keep images that sit inside a paragraph. The HTML converter used to drop `<p>text <img> text</p>` images; it now splits the paragraph into a text block, an image block and a text block
