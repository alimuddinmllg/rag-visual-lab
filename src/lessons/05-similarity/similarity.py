# NalarNusa RAG Visual Lab · Lesson 5 · Measuring similarity between two vectors
import math
import numpy as np


# @stage vectors
def from_angle(angle_deg, length):
    a = math.radians(angle_deg)
    return np.array([length * math.cos(a), length * math.sin(a)])
# @end


# @stage dot
def dot(a, b):
    """Multiply matching numbers and add them up."""
    return float(np.sum(a * b))
# @end


# @stage lengths
def length(v):
    return float(np.sqrt(np.sum(v * v)))
# @end


# @stage cosine
def cosine(a, b):
    """Direction only: 1 = same direction, 0 = unrelated (90°), -1 = opposite."""
    return dot(a, b) / (length(a) * length(b))
# @end


# @stage distance
def euclidean(a, b):
    """Straight-line distance between the two tips. Sensitive to length."""
    return length(a - b)
# @end


def run(angle_a, len_a, angle_b, len_b):
    a, b = from_angle(angle_a, len_a), from_angle(angle_b, len_b)
    res = {"dot": dot(a, b), "len_a": length(a), "len_b": length(b),
           "cosine": cosine(a, b), "distance": euclidean(a, b)}
    for k, v in res.items():
        print(f"{k:9s} {v:7.3f}")
    return res
