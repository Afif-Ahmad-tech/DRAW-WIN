# Drawing word library

`words.txt` contains 3,000 unique lowercase English words, bundled locally so gameplay does not need an external word API.

The list contains concrete, drawable objects: manufactured items and buildings, plus selected food and natural objects. Candidates came from WordNet 3.0's physical artifact noun senses and were ranked using the English 2018 frequency list from Hermit Dave's FrequencyWords project. Familiar food, artwork and natural objects were added by hand. Abstract terms, actions, living creatures, non-object locations, ambiguous senses, capitalized names, punctuation, and words outside 3–14 letters were excluded. The final list was deduplicated and sorted.

Sources retrieved November 11, 2026:

- WordNet 3.0, Princeton University: https://wordnet.princeton.edu/ (data distributed through https://github.com/nltk/nltk_data/tree/gh-pages/packages/corpora). Copyright 2006 Princeton University; full notice in `licenses/WordNet.txt`.
- Hermit Dave, FrequencyWords English 2018: https://github.com/hermitdave/FrequencyWords/blob/master/content/2018/en/en_50k.txt. Based on OpenSubtitles2018. Content licensed under CC BY-SA 4.0, as documented in that repository's README.

The modified word-list content is provided under **CC BY-SA 4.0**, with the WordNet notice retained. The full CC BY-SA 4.0 license is in `licenses/CC-BY-SA-4.0.txt`. This data license applies to `words.txt`, not the application code.
