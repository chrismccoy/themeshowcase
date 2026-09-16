# Theme Showcase Previewer

A website for showing off WordPress themes. Visitors pick a theme from a list, see its full screenshot inside a fake browser window, and open the live demo if they want live site view.

## Features

* Pick a theme from the list and its screenshot appears in a fake browser window, with the theme's web address in the address bar.
* Tall screenshots scroll inside a window, so the rest of the page stays where it is.
* The address bar is a link. Clicking it opens the real site in a new tab.
* Search by name, by category, or by anything in a theme's description.
* Filter by category. Each category button shows how many themes it holds, counting only what the search has.
* Arrow keys move up and down the list, and Enter opens the demo site.
* A dashboard with a password for adding, editing, reordering and deleting themes and categories.
* A theme holds a title, a website, a category, a screenshot, and an optional description of up to 300 characters shown under its name.
* Screenshots are dragged onto the form or picked from your device, and you see the picture before saving it.
* A screenshot is either uploaded or generated. Generating opens an address in a headless browser on the server and takes the picture, and you see it before you save.
* Generating refuses addresses inside the server's own network, and checks every redirect on the way.
* Generating needs Chrome, which `npm install` fetches. Set `SCREENSHOT_ENABLED=false` where it cannot run, and the choice disappears from the form.
* Deleting a theme deletes its screenshot file as well.
* A category with themes cannot be deleted
* Themes are put in order with up and down arrows, and that is the order visitors see.
* The admin dashboard can be IP limited.
