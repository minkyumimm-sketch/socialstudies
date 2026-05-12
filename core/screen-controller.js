export function showScreen(targetScreen, allScreens) {
  allScreens.forEach((screen) => {
    screen.classList.remove("active");
  });

  targetScreen.classList.add("active");
}

export function showQuizScreen(quizScreen, allScreens) {
  showScreen(quizScreen, allScreens);
}

export function showResultScreen(resultScreen, allScreens) {
  showScreen(resultScreen, allScreens);
}

export function showStartScreen(startScreen, allScreens) {
  showScreen(startScreen, allScreens);
}