# 배포 (GitHub Pages)

`.github/workflows/deploy.yml`이 `main` 또는 `master` 브랜치에 올라온 코드를 테스트 → 빌드 → Pages에 배포한다.
한자 데이터(`public/data`)는 저장소에 들어 있으므로 Python 파이프라인은 돌리지 않는다.
빌드가 상대 경로(`base: './'`)라서 `https://<계정>.github.io/<저장소>/` 어느 이름으로 올려도 그대로 동작한다.

## 처음 한 번

1. GitHub에서 새 저장소를 만든다 (예 : `kanji-app`). 공개 저장소여야 무료 계정에서 Pages를 쓸 수 있다.
2. 저장소 Settings › Pages › Build and deployment › Source를 **GitHub Actions**로 바꾼다.
3. 이 폴더에서 원격을 연결하고 올린다.

   ```bash
   git remote add origin https://github.com/<계정>/kanji-app.git
   git push -u origin master
   ```

4. Actions 탭에서 'Pages 배포'가 끝나면 `https://<계정>.github.io/kanji-app/` 에서 열린다.

## 휴대폰 설치 확인 (M7 완료 기준)

1. 휴대폰 브라우저로 위 주소를 연다. 첫 접속 때 약 24MB를 받는다 (Wi-Fi 권장). "이제 인터넷 없이도 쓸 수 있습니다"가 뜨면 준비 완료.
2. 홈 화면에 추가 : Android Chrome은 메뉴 › 앱 설치, iPhone Safari는 공유 › 홈 화면에 추가.
3. 비행기 모드로 바꾼 뒤 홈 화면 아이콘으로 열어 학습 카드, 획순, 격자, 통계를 확인한다.
4. 설정 › 데이터에서 백업을 내보내 다른 브라우저에서 가져와 본다.

## 이후 배포

코드를 고쳐 커밋하고 `git push` 하면 자동으로 다시 배포된다.
이미 설치한 기기에는 다음에 열 때 "새 버전이 있습니다 [새로 고침]"이 뜬다.
