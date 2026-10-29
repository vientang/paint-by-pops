# Paint By Pops

An art gallery for my pops artwork.

## What's in this folder

| Folder / file | Description | Do you edit it? |
|---|---|---|
| `content/artworks.yml` | Every artwork: title, date, description, photo names | **Yes, often** |
| `content/site.yml` | Your name, bio, location | Occasionally |
| `photos/artworks/` | The main photo of each piece | **Yes** (upload) |
| `photos/extras/` | Behind-the-scenes / inspiration photos | **Yes** (upload) |
| `photos/about.jpg` | Your photo for the About page | Occasionally |
| `src/`, `scripts/` | The design and the code that builds the site | No |

---

## Part 1: Put it online (one time, about 20 minutes, easiest on a computer)

1. **Create a GitHub repository.** On github.com, tap **New repository**, name it (for example `gallery`), and create it. Private is fine.
2. **Upload this folder.** On the new repository's page choose **uploading an existing file**, then drag in everything that is *inside* this folder (so `package.json` ends up at the top level), and tap **Commit changes**.
   Files whose names start with a dot (`.node-version`, `.gitignore`) are part of the folder but hidden by default; on a Mac press Cmd+Shift+. in Finder to show them. If `.node-version` doesn't make it in, add a build variable named `NODE_VERSION` with the value `20` in Cloudflare.
3. **Connect Cloudflare.** In the Cloudflare dashboard go to **Workers & Pages**, create a **Pages** project, and choose **Connect to Git**. (Cloudflare rearranges these screens from time to time; look for "Pages" and "Connect to Git".) Pick your repository, then enter:
   - Framework preset: **None**
   - Build command: **`npm run build`**
   - Build output directory: **`dist`**

   Save and deploy. After a minute or two you get an address like `https://gallery-abc.pages.dev`. That's your live site.
4. **Optional:** open `content/site.yml` and paste that address into `url:`. It makes links shared by text message show a preview picture.

**Preview on your computer (optional).** Install Node 20 or newer, then run `npm install` once and `npm run dev`, and open http://localhost:8080.

---

## Part 2: Add a new artwork (works from an iPad)

1. **Prepare the photo.** A JPEG, about 3000 pixels on the long side, under 20 MB. Use a simple lowercase name with no spaces, such as `lake-at-dawn.jpg`.
   The site makes small, medium and large copies for you, so upload your best version.
2. **Upload it.** In GitHub, open the `photos` folder, then `artworks`, then **Add file → Upload files**, choose the photo, and **Commit changes**.
   Do the same for behind-the-scenes photos, but into `photos/extras`.
3. **Add the entry.** Open `content/artworks.yml`, tap the pencil (edit) icon, and paste a new block **at the top** (the first piece is the home page):

```yaml
- id: lake-at-dawn
  title: "Lake at Dawn"
  completed: "October 2026"
  description: "Oil on canvas. Painted from memory of early mornings at the lake."
  photo: lake-at-dawn.jpg
  extras:
    - kind: Behind the scenes
      title: "Under the studio light"
      description: "The painting about halfway done."
      photo: lake-at-dawn-studio.jpg
```

4. **Commit.** After one or two minutes, refresh your site.

**Rules for the text file**
- Keep the spaces exactly as in the example. Every line inside a block is indented the same amount.
- `id` is the web-address name: lowercase letters, numbers and dashes. Every piece needs its own.
- Put text in "quotes" if it contains a colon.
- `completed`, `alt` and `extras` are optional. Leave them out if you don't need them.
- If a piece has no extras, the "More about this piece" strip simply doesn't appear.

**If something is wrong**, the build stops with a plain message (for example, "Photo not found: photos/artworks/lake.jpg"). In Cloudflare, open your project, then **Deployments**, and tap the failed one to read it. Your live site stays exactly as it was until a build succeeds.

---

## What happens automatically

- Each photo is resized into thumbnail, standard and large web versions. Visitors only download what their screen needs; the large version loads only when someone taps to enlarge.
- The page background is a very light tint of the color opposite the painting's main color. It is calculated while the site builds, so there is no delay when people browse.
- For black-and-white or very muted paintings, the background falls back to a warm off-white. To pick your own, add `background: "#E8E1F0"` to that piece.
- Next and previous pieces are loaded quietly in the background so paging feels instant.
- On newer iPads and iPhones (iOS 18.2 and up), colors and pages blend smoothly as people move around. Older devices simply switch pages.
- Pinch-to-zoom is never blocked, and the enlarged-photo viewer supports it.

---

## Later: your own web address

Cloudflare Pages: open your project, choose **Custom domains**, and follow the steps. Cloudflare tells you which DNS record to add. If you buy the domain from Squarespace or another registrar, you add that record there (or move the domain's name servers to Cloudflare). You only need Squarespace as the place the name is registered; you don't need a Squarespace website. Afterwards, update `url:` in `content/site.yml`.

## Removing the sample content

Delete the three `sample-...` blocks in `content/artworks.yml` and the `sample-...` photos in `photos/artworks` and `photos/extras`. Replace `photos/about.jpg` with your own photo, and change the bracketed `[placeholders]` in `content/site.yml`.

## Troubleshooting

| You see | Fix |
|---|---|
| "is a HEIC photo" | Photos straight from an iPhone or iPad can be HEIC. Export or save a JPEG copy and upload that. |
| "Photo not found" | The file name in `artworks.yml` doesn't match the uploaded file (spelling, capital letters, `.jpg` vs `.jpeg`), or it's in the wrong folder. |
| "typing problem in content/artworks.yml" | Usually a missing quote or different spacing on a line. Compare with a block that works. |
| Upload refused on GitHub | GitHub's website limits each file to 25 MB. Export a smaller JPEG. |
| Site didn't change | Wait two minutes and refresh. Then check Deployments in Cloudflare for a failed build. |
