"""build_korean.py 훈음 나누기 테스트. 실행 : data-pipeline 폴더에서 `python -m unittest discover tests`"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from build_korean import dueum, ranked_options, split_hunum  # noqa: E402


class DueumTest(unittest.TestCase):
    def test_n_before_y_vowels(self):
        self.assertEqual(dueum("녀"), "여")
        self.assertEqual(dueum("년"), "연")
        self.assertEqual(dueum("뇨"), "요")

    def test_r_before_y_vowels(self):
        self.assertEqual(dueum("려"), "여")
        self.assertEqual(dueum("륙"), "육")
        self.assertEqual(dueum("리"), "이")
        self.assertEqual(dueum("렬"), "열")

    def test_r_before_other_vowels(self):
        self.assertEqual(dueum("로"), "노")
        self.assertEqual(dueum("락"), "낙")

    def test_unchanged(self):
        for s in ("국", "남", "노", "김", "a", ""):
            self.assertEqual(dueum(s), s)


class SplitHunumTest(unittest.TestCase):
    def test_plain_line(self):
        self.assertEqual(split_hunum("년", "해 년"), {"hun": "해", "eum": "년"})
        self.assertEqual(split_hunum("금", "쇠 금"), {"hun": "쇠", "eum": "금"})

    def test_dueum_line_uses_original_sound(self):
        # hanja.txt `연:年:해 년, 나이 년` / `여:旅:나그네 려` / `육:六:여섯 륙`
        self.assertEqual(split_hunum("연", "해 년"), {"hun": "해", "eum": "년"})
        self.assertEqual(split_hunum("여", "나그네 려"), {"hun": "나그네", "eum": "려"})
        self.assertEqual(split_hunum("육", "여섯 륙"), {"hun": "여섯", "eum": "륙"})

    def test_different_reading_is_kept(self):
        # 金 김 : 다른 음(김)이지 두음이 아니다
        self.assertEqual(split_hunum("김", "사람의 성 김"), {"hun": "사람의 성", "eum": "김"})

    def test_unmatched_ending_kept_whole(self):
        # 뜻 끝이 음과도, 두음 형태와도 맞지 않으면 나누지 않는다
        self.assertEqual(split_hunum("금", "성"), {"hun": "성", "eum": "금"})
        self.assertEqual(split_hunum("여", "같을 약"), {"hun": "같을 약", "eum": "여"})


class RankedOptionsTest(unittest.TestCase):
    def test_dueum_line_merges_with_original(self):
        hanja = {"年": [("년", ["해 년"]), ("연", ["해 년", "나이 년", "나아갈 년"])]}
        self.assertEqual(
            ranked_options("年", hanja, ["년"]),
            [{"hun": "해", "eum": "년"}, {"hun": "나이", "eum": "년"}, {"hun": "나아갈", "eum": "년"}],
        )

    def test_travel(self):
        hanja = {"旅": [("려", ["군사 려", "나그네 려"]), ("여", ["나그네 려", "베풀 려"])]}
        self.assertEqual(
            [f"{o['hun']} {o['eum']}" for o in ranked_options("旅", hanja, ["려"])],
            ["군사 려", "나그네 려", "베풀 려"],
        )


if __name__ == "__main__":
    unittest.main()
