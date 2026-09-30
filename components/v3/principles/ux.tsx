import { Card, Chapter, lawsofux, nng } from './b-kit';
import { DohertyDemo, FittsDemo, HickDemo, JakobDemo, PeakEndDemo, RestorffDemo } from './b-ux-a';
import { GestaltDemo, GoalDemo, MillerDemo, SerialLooksDemo, StepperDemo, TeslerDemo } from './b-ux-b';

export function UxChapter() {
  return (
    <Chapter
      id="ux"
      intro="Twelve findings about how people use screens, each one something you can try right here. A law of UX is a pattern that research keeps finding, not a rule someone made up. Play the demo first, then read why."
    >
      <Card
        code="U1"
        rule="I make targets big and close (Fitts)."
        why="The time to hit a target grows with distance and shrinks with size. Small and far is always slow."
        source={lawsofux('fittss-law', "lawsofux · Fitts's law")}
      >
        <FittsDemo />
      </Card>
      <Card
        code="U2"
        rule="I cut the choices to speed up the decision (Hick)."
        why="Every extra option adds decision time. Grouping or search turns 24 choices into a few."
        source={lawsofux('hicks-law', "lawsofux · Hick's law")}
      >
        <HickDemo />
      </Card>
      <Card
        code="U3"
        rule="I put things where people already look (Jakob)."
        why="People spend most of their time on other sites. They bring those habits to mine."
        source={lawsofux('jakobs-law', "lawsofux · Jakob's law")}
      >
        <JakobDemo />
      </Card>
      <Card
        code="U4"
        rule="I answer within 400ms (Doherty)."
        why="Under about 400ms people stay in flow. Past a second, their mind wanders off."
        source={lawsofux('doherty-threshold', 'lawsofux · Doherty threshold')}
      >
        <DohertyDemo />
      </Card>
      <Card
        code="U5"
        rule="I end on a high (peak-end)."
        why="People judge an experience by its best moment and its last one, not the average."
        source={lawsofux('peak-end-rule', 'lawsofux · peak-end rule')}
      >
        <PeakEndDemo />
      </Card>
      <Card
        code="U6"
        rule="I make the one thing I want seen different (von Restorff)."
        why="The odd one out is the one people remember. It works in black and white, no colour needed."
        source={lawsofux('von-restorff-effect', 'lawsofux · von Restorff effect')}
      >
        <RestorffDemo />
      </Card>
      <Card
        code="U7"
        rule="I group with space, shape and regions (Gestalt)."
        why="Gestalt means the eye sees wholes before parts. Any one cue is enough to make groups appear."
        source={lawsofux('law-of-proximity', 'lawsofux · proximity')}
      >
        <GestaltDemo />
      </Card>
      <Card
        code="U8"
        rule="I join steps with a line and keep shapes simple (Prägnanz)."
        why="Connected things read as one path, and the eye prefers the simplest shape it can find."
        source={{ href: 'https://lawsofux.com/law-of-pr%C3%A4gnanz/', label: 'lawsofux · Prägnanz' }}
      >
        <StepperDemo />
      </Card>
      <Card
        code="U9"
        rule="I chunk long strings (Miller)."
        why="Working memory holds only a few things at once. Four groups of four is far easier than twelve loose digits."
        source={lawsofux('millers-law', "lawsofux · Miller's law")}
      >
        <MillerDemo />
      </Card>
      <Card
        code="U10"
        rule="I take on the complexity so you don't have to (Tesler)."
        why="Some complexity can't be removed, only moved. I'd rather the system carry it than the person."
        source={lawsofux('teslers-law', "lawsofux · Tesler's law")}
      >
        <TeslerDemo />
      </Card>
      <Card
        code="U11"
        rule="I show progress and leave a nudge (goal gradient, Zeigarnik)."
        why="People speed up near the finish, and an unfinished task keeps tugging at them."
        source={lawsofux('goal-gradient-effect', 'lawsofux · goal gradient')}
      >
        <GoalDemo />
      </Card>
      <Card
        code="U12"
        rule="I put key items first and last, and polish what matters (serial position)."
        why="The ends of a list stick best. And a design that looks good is judged easier to use, so polish is not decoration."
        source={lawsofux('serial-position-effect', 'lawsofux · serial position')}
      >
        <SerialLooksDemo />
      </Card>
    </Chapter>
  );
}
