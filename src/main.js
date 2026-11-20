import './styles/main.css';

// Bookmarks to /#game still open the game. BASE_URL keeps a GitHub Pages prefix.
if (location.hash === '#game') {
  location.replace(new URL('views/game.html', location.origin + import.meta.env.BASE_URL));
}
