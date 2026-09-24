# Brand icon overrides

Drop a file here named after the app id and it replaces that app's built-in icon
everywhere — desktop, taskbar, Start menu and the phone home screen — with no code
change. The file is probed once at runtime and silently ignored if absent.

    public/brand/<appId>.svg      (or .png / .webp)

App ids: about · projects · experience · skills · achievements · lab · contact ·
browser · notepad · docs · player · explorer · settings · terminal · resume ·
welcome · recyclebin · computer · minesweeper · solitaire · tube

Example — to use a real Chrome mark for the browser app:

    public/brand/browser.svg

A square file works best; 512×512 for raster. The icon is rendered with
`object-fit: contain` and the app's corner radius.

**Note on trademarks.** Browser and product logos are trademarks of their owners.
Nothing in this repo ships one by default — that is a deliberate choice, and adding
one here is the site owner's decision to make.
