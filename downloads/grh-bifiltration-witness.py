"""Exact F2 cycle images on two filtrations of the same genus-two dessin."""
from itertools import permutations, product
import json


BIRTHS = ((2, 0), (1, 1), (0, 2))
GRADES = tuple(product(range(3), repeat=2))


def below(a, b):
    return all(i <= j for i, j in zip(a, b))


def xor_rank(vectors):
    pivots = {}
    for v in vectors:
        while v:
            i = v.bit_length() - 1
            if i not in pivots:
                pivots[i] = v
                break
            v ^= pivots[i]
    return len(pivots)


def layout(split):
    # Vertices 0 and 1 are the two centers. A split path uses vertex 2+j.
    edges, paths = [], []
    for j in range(5):
        segment = [(0, j+2), (j+2, 1)] if split else [(0,1)]
        start = len(edges)
        edges.extend(segment)
        paths.append(sum(1 << i for i in range(start, len(edges))))
    return edges, paths


def cycle_vectors(mask, edges):
    # Enumerate every binary edge chain and impose the vertex boundary.
    ans = []
    chain = mask
    while True:
        bdry = 0
        for i,(u,v) in enumerate(edges):
            if chain & (1 << i):
                bdry ^= (1 << u) ^ (1 << v)
        if not bdry:
            ans.append(chain)
        if not chain:
            return ans
        chain = (chain - 1) & mask


def surface():
    # Incidence stars at both black centers have the same cyclic ordering.
    n = 5
    stars = {0: tuple(range(2, 2+n)), 1: tuple(range(2, 2+n))}
    stars.update({i:(0,1) for i in range(2,2+n)})
    darts = {(u,v) for u,vv in stars.items() for v in vv}
    faces = []
    while darts:
        u,v = min(darts)
        face = []
        while (u,v) in darts:
            face.append((u,v))
            darts.remove((u,v))
            star = stars[v]
            u,v = v,star[(star.index(u)+1) % len(star)]
        assert (u,v)==face[0]
        faces.append(face)
    edges, _ = layout(True)
    edge_ids = {frozenset(edge): i for i,edge in enumerate(edges)}
    assert len(faces)==1 and len(faces[0])==20
    boundary = 0
    for dart in faces[0]:
        boundary ^= 1 << edge_ids[frozenset(dart)]
    assert boundary==0
    assert (2-(len(stars)-len(edges)+len(faces)))//2==2
    return [len(stars),len(edges),len(faces)]


def compare(split):
    edges,paths=layout(split)
    whole=(1<<len(edges))-1
    cache = {}
    def cycles(mask):
        if mask not in cache:
            cache[mask]=cycle_vectors(mask,edges)
        return cache[mask]
    comparable=[(a,b) for a in GRADES for b in GRADES if below(a,b)]
    assert len(comparable)==36
    for perm in permutations(range(5)):
        pairs = [(perm[0],perm[1]),(perm[1],perm[2])]
        tables = []
        sums = []
        for third in [(perm[0],perm[2]),(perm[0],perm[3])]:
            loops = [paths[i] ^ paths[j] for i,j in pairs+[third]]
            filtration = {}
            for grade in GRADES:
                born = [v for k,v in zip(BIRTHS,loops) if below(k,grade)]
                filtration[grade] = whole if len(born)>=2 else (born[0] if born else 0)
            ranks = {}
            for a,b in comparable:
                assert filtration[a] & filtration[b] == filtration[a]
                image = cycles(filtration[a])
                assert set(image) <= set(cycles(filtration[b]))
                # Edge inclusions are literal. No graph face kills a class.
                # The single cap at (2,2) also has zero boundary, checked above.
                ranks[a,b] = xor_rank(image)
            tables.append(ranks)
            singleton_classes = [next(v for v in cycles(filtration[k]) if v) for k in BIRTHS]
            assert all(xor_rank([x,y])==2 for i,x in enumerate(singleton_classes) for y in singleton_classes[i+1:])
            sums.append(xor_rank(singleton_classes))
        assert tables[0]==tables[1] and sums==[2,3]
        assert tables[0][(2,2),(2,2)]==4
    return {'relabelings':120, 'pairs':len(comparable), 'terminal_h1':4, 'three_image_span_ranks':sums}


if __name__=='__main__':
    print(json.dumps({'vertices_edges_faces':surface(),
                      'contracted':compare(False), 'subdivided':compare(True)},indent=2))
