# NalarNusa RAG Visual Lab · Lesson 25 · Scaling: an IVF index, its recall/latency curve, and memory at millions
# IVF = "inverted file": group the vectors into cells, then search only the few cells nearest the query.
from ann import rng, make_points, d2                                   # lesson 11


# @stage points
def make_queries(points, seed, count=40):
    """Queries near stored vectors, like real questions near real chunks."""
    r = rng(seed + 99)
    out = []
    for j in range(count):
        x, y = points[(j * 37) % len(points)]
        out.append((x + (r() - 0.5) * 0.2, y + (r() - 0.5) * 0.2))
    return out


def brute_force(points, q, k):
    return [i for _, i in sorted((d2(p, q), i) for i, p in enumerate(points))[:k]]
# @end


# @stage train
def nearest(centroids, p):
    best, bd = 0, d2(centroids[0], p)
    for c in range(1, len(centroids)):
        d = d2(centroids[c], p)
        if d < bd:
            best, bd = c, d
    return best


def kmeans(points, nlist, iters=8):
    """Plain k-means: start from evenly spaced points, then move each centre to the mean of its points."""
    centroids = [points[(i * len(points)) // nlist] for i in range(nlist)]
    for _ in range(iters):
        sx, sy, cnt = [0.0] * nlist, [0.0] * nlist, [0] * nlist
        for p in points:
            c = nearest(centroids, p)
            sx[c] += p[0]; sy[c] += p[1]; cnt[c] += 1
        centroids = [(sx[c] / cnt[c], sy[c] / cnt[c]) if cnt[c] else centroids[c] for c in range(nlist)]
    return centroids
# @end


# @stage assign
def inverted_lists(points, centroids):
    """Each cell keeps the ids of its vectors. This is the index."""
    lists = [[] for _ in centroids]
    for i, p in enumerate(points):
        lists[nearest(centroids, p)].append(i)
    return lists
# @end


# @stage sweep
def sweep(points, centroids, lists, queries, exact, k):
    """For nprobe = 1..nlist: recall@k and comparisons, averaged over the queries."""
    nlist = len(centroids)
    recall, comps = [0.0] * nlist, [0] * nlist
    for q, truth in zip(queries, exact):
        order = [c for _, c in sorted((d2(centroids[c], q), c) for c in range(nlist))]
        best, scanned = [], 0
        for p in range(nlist):                       # probe one more cell each time
            cell = lists[order[p]]
            scanned += len(cell)
            best = sorted(best + [(d2(points[i], q), i) for i in cell])[:k]
            recall[p] += len({i for _, i in best} & set(truth)) / k
            comps[p] += nlist + scanned              # centroid comparisons + vectors scanned
    n = len(queries)
    return [(p + 1, recall[p] / n, comps[p] / n) for p in range(nlist)]
# @end


# @stage scale
def choose(curve, target, n):
    """The smallest nprobe that reaches the target recall."""
    for nprobe, rec, comp in curve:
        if rec >= target:
            return nprobe, rec, comp, n / comp
    nprobe, rec, comp = curve[-1]
    return nprobe, rec, comp, n / comp


def at_scale(millions, dims, precision, fraction):
    """Memory and time per query when the collection has millions of vectors (rough CPU: 1e10 multiply-adds/s)."""
    N = millions * 1_000_000
    gb = N * dims * (4 if precision == "float32" else 1) / 1e9
    exact_ms = N * dims / 1e10 * 1000
    return gb, exact_ms, exact_ms * fraction


def demo(n, nlist, target, millions, dims, precision, seed=7, k=10):
    points = make_points(n, seed)
    queries = make_queries(points, seed)
    exact = [brute_force(points, q, k) for q in queries]
    centroids = kmeans(points, nlist)
    lists = inverted_lists(points, centroids)
    curve = sweep(points, centroids, lists, queries, exact, k)
    nprobe, rec, comp, speedup = choose(curve, target, n)
    gb, exact_ms, ivf_ms = at_scale(millions, dims, precision, comp / n)
    for p, r, c in curve:
        print(f"nprobe {p:2d}: recall@{k} {r:.0%}  comparisons {c:7.1f}")
    print(f"pick nprobe = {nprobe}: recall {rec:.0%}, {speedup:.1f}x fewer comparisons than brute force")
    print(f"{millions}M x {dims} dims ({precision}): {gb:.1f} GB, exact {exact_ms:.0f} ms vs IVF {ivf_ms:.1f} ms per query")
    return {"sizes": [len(l) for l in lists], "curve": curve, "nprobe": nprobe, "gb": gb, "exact_ms": exact_ms, "ivf_ms": ivf_ms}
# @end
