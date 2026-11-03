# NalarNusa RAG Visual Lab · Lesson 29 · GraphRAG with an LLM extractor and networkx
# pip install networkx openai
# Any OpenAI-compatible endpoint works, e.g. Ollama.
import os
import json
import networkx as nx
from openai import OpenAI

# LLM: Ollama on your computer by default. The notebook sets LLM_BASE_URL / LLM_MODEL to the lab's free model when it runs in Colab.
llm = OpenAI(base_url=os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1"), api_key=os.environ.get("LLM_API_KEY", "ollama"))
MODEL = os.environ.get("LLM_MODEL", "llama3.2")
DOC = "campus.md"
if not os.path.exists(DOC):   # no document of your own: the lesson's campus facts, a few sentences per chunk
    open(DOC, "w", encoding="utf-8").write(
        "Ms Rahma coordinates the NusaBot Robotics Lab. Dr Bayu leads the Drone Project. Sari works on the Drone Project.\n\n"
        "The Drone Project runs its tests in the Wind Tunnel. The Wind Tunnel is in Building C. Building C is next to the main library.\n\n"
        "Dr Bayu teaches the Control Systems course. The Control Systems course meets in Building A. Building A has the soldering stations.\n\n"
        "Sari also builds the Sensor Kit. The Sensor Kit gets its funding from the Rural Grant. Ms Rahma manages the Rural Grant.")
chunks = [c for c in open(DOC, encoding="utf-8").read().split("\n\n") if c.strip()]

# @stage extract
PROMPT = ("Extract facts from the text as JSON: {\"triples\": [[subject, relation, object], ...]}. "
          "Use short names for subjects and objects, and reuse the same name for the same thing.\n\nText:\n")
G = nx.Graph()
for n, chunk in enumerate(chunks):
    reply = llm.chat.completions.create(model=MODEL, response_format={"type": "json_object"},
                                        messages=[{"role": "user", "content": PROMPT + chunk}])
    for t in json.loads(reply.choices[0].message.content).get("triples", []):
        if isinstance(t, list) and len(t) == 3:                     # models sometimes return a broken triple: skip it
            s, rel, o = (str(x) for x in t)
            G.add_edge(s.lower(), o.lower(), relation=rel, chunk=n)  # the chunk is the evidence
print(G.number_of_nodes(), "things,", G.number_of_edges(), "relations")
# @end

# @stage seed
question = "In which building does Dr Bayu's project run its tests?"
starts = [node for node in G.nodes if node in question.lower()]
# @end

# @stage walk
candidates = []
for s in starts:
    for target, path in nx.single_source_shortest_path(G, s, cutoff=3).items():
        if "building" in target:
            candidates.append(path)
# @end

# @stage answer
for path in candidates:
    evidence = [chunks[G.edges[a, b]["chunk"]] for a, b in zip(path, path[1:])]
    print(" -> ".join(path))
    # give the path and its evidence to the LLM, and let it write the answer with citations
# @end
