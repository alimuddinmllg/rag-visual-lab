# NalarNusa RAG Visual Lab · Lesson 11 · Exact search vs a graph index (NSW, the idea behind HNSW)


def rng(seed):
    s = seed % 2147483646 + 1
    def rand():
        nonlocal s
        s = s * 16807 % 2147483647
        return s / 2147483647
    return rand


# @stage points
def make_points(n, seed, clusters=6):
    r = rng(seed)
    centers = [(0.12 + r() * 0.76, 0.12 + r() * 0.76) for _ in range(clusters)]
    pts = []
    for i in range(n):
        cx, cy = centers[i % clusters]
        jx = (r() + r() + r()) / 3 - 0.5
        jy = (r() + r() + r()) / 3 - 0.5
        pts.append((min(1, max(0, cx + jx * 0.4)), min(1, max(0, cy + jy * 0.4))))
    return pts


def d2(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
# @end


# @stage build
def build_nsw(points, M):
    """Insert points one by one; link each to its M nearest earlier points, both ways."""
    nbrs = [[] for _ in points]
    for i in range(1, len(points)):
        cand = sorted((d2(points[i], points[j]), j) for j in range(i))
        for _, j in cand[:M]:
            nbrs[i].append(j)
            nbrs[j].append(i)
    return nbrs
# @end


# @stage brute
def brute_force(points, q, k):
    """Compare the query with every single vector: exact, but cost grows with the collection."""
    return [i for _, i in sorted((d2(p, q), i) for i, p in enumerate(points))[:k]], len(points)
# @end


# @stage search
def search_nsw(points, nbrs, q, k, ef, entry=0):
    """Walk the graph: always expand the closest unexplored point, stop when nothing closer is left."""
    count = 0
    def dist(i):
        nonlocal count
        count += 1
        return d2(points[i], q)
    visited = {entry}
    d0 = dist(entry)
    cand, res = [(d0, entry)], [(d0, entry)]
    width = max(ef, k)
    while cand:
        cand.sort()
        d, c = cand.pop(0)
        if len(res) >= width and d > res[-1][0]:
            break
        for nb in nbrs[c]:
            if nb in visited:
                continue
            visited.add(nb)
            dn = dist(nb)
            if len(res) < width or dn < res[-1][0]:
                cand.append((dn, nb))
                res.append((dn, nb))
                res.sort()
                if len(res) > width:
                    res.pop()
    return [i for _, i in res[:k]], count
# @end


# @stage compare
def run(n, seed, M, ef, qx, qy, k=5):
    pts = make_points(n, seed)
    nbrs = build_nsw(pts, M)
    exact, c1 = brute_force(pts, (qx, qy), k)
    found, c2 = search_nsw(pts, nbrs, (qx, qy), k, ef)
    recall = len(set(exact) & set(found)) / k
    print(f"brute force: {c1} comparisons; graph: {c2} comparisons; recall@{k} = {recall:.0%}")
    return {"exact": exact, "found": found, "brute": c1, "graph": c2}
# @end
