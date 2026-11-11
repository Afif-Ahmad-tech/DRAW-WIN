# Drawing word library

`words.txt` contains 3,000 unique lowercase English words, bundled locally so gameplay does not need an external word API.

The list combines the original eight game words with concrete noun candidates from WordNet 3.0, ranked using the English 2018 frequency list from Hermit Dave's FrequencyWords project. The selection uses primary noun senses for animals, objects, food, plants, locations, body parts, shapes, materials and natural phenomena. Capitalized names, punctuation, words outside 4–14 letters, and selected unsuitable or ambiguous terms were excluded. The final list was deduplicated and sorted.

Sources retrieved November 11, 2026:

- WordNet 3.0, Princeton University: https://wordnet.princeton.edu/ (data distributed through https://github.com/nltk/nltk_data/tree/gh-pages/packages/corpora). Copyright 2006 Princeton University; full notice in `licenses/WordNet.txt`.
- Hermit Dave, FrequencyWords English 2018: https://github.com/hermitdave/FrequencyWords/blob/master/content/2018/en/en_50k.txt. Based on OpenSubtitles2018. Content licensed under CC BY-SA 4.0, as documented in that repository's README.

The modified word-list content is provided under **CC BY-SA 4.0**, with the WordNet notice retained. The full CC BY-SA 4.0 license is in `licenses/CC-BY-SA-4.0.txt`. This data license applies to `words.txt`, not the application code.
