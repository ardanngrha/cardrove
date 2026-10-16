export const brand = 'Cardrove';
export const repository = import.meta.env.PUBLIC_REPOSITORY || 'https://github.com/ardanngrha/cardrove';
export const link = (path = '') => import.meta.env.BASE_URL.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
export const chapters = [
  { slug: '', title: 'Start here', description: 'Choose your setup and import your first deck.' },
  { slug: 'self-host', title: 'Host your own', description: 'Local server or Cloudflare Pages and Supabase.' },
  { slug: 'studying', title: 'Study & organise', description: 'Review, ratings, search, edit, and daily preferences.' },
  { slug: 'devices-backups', title: 'Devices & backups', description: 'Connect a device, export, and restore safely.' },
  { slug: 'compatibility', title: 'Deck compatibility', description: 'Supported Anki features and current limits.' },
  { slug: 'architecture', title: 'Under the hood', description: 'How the app, API, scheduler, and media fit together.' },
  { slug: 'contributing', title: 'Contribute', description: 'Develop locally and send focused improvements.' },
];
