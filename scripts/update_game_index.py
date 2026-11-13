import json, os, re

GAMES_DIR = 'games'
OUTPUT = 'games.json'
SLUG_RE = re.compile(r'^[a-z0-9][a-z0-9-]*$')

games = []
if os.path.isdir(GAMES_DIR):
    for slug in sorted(os.listdir(GAMES_DIR)):
        folder = os.path.join(GAMES_DIR, slug)
        if not os.path.isdir(folder):
            continue
        if not os.path.isfile(os.path.join(folder, 'index.html')):
            continue
        if not SLUG_RE.match(slug):
            print(f"Skipping invalid slug: {slug}")
            continue

        title = slug.replace('-', ' ').title()
        description = 'A browser game.'
        emoji = '\U0001F3AE'

        meta_path = os.path.join(folder, 'game.json')
        if os.path.isfile(meta_path):
            try:
                with open(meta_path, 'r', encoding='utf-8') as f:
                    meta = json.load(f)
                if not isinstance(meta, dict):
                    raise ValueError('metadata must be a JSON object')
                if isinstance(meta.get('title'), str):
                    title = meta['title']
                if isinstance(meta.get('description'), str):
                    description = meta['description']
                if isinstance(meta.get('emoji'), str):
                    emoji = meta['emoji']
            except (ValueError, OSError, UnicodeError) as e:
                print(f"Warning: could not read game.json for {slug}: {e}")

        games.append({
            'slug': slug,
            'title': title,
            'description': description,
            'emoji': emoji,
            'url': f'games/{slug}/'
        })

with open(OUTPUT, 'w', encoding='utf-8') as f:
    json.dump(games, f, indent=2, ensure_ascii=False)
    f.write('\n')

print(f"Generated {OUTPUT} with {len(games)} game(s)")
