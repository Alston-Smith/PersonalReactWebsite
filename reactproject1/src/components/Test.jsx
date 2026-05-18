import { useEffect, useState, useRef } from 'react'
import './test.css'

export default function App() {
    const [count, setCount] = useState(0);
    const [points, setPoints] = useState(0);

    useIncrementPoints(points, setPoints, count); // ✅ called as a hook

    return (
        <section id="GamePage">
            <div className="game-page">
                <div className="game-header">
                    {"Points: " + points}
                </div>
                <div className="game">
                    <div className="game-button1">
                        <MyButton count={count} setCount={setCount} />
                    </div>
                    <div className="game-button1">
                        <MyButton count={count} setCount={setCount} />
                    </div>
                    <div className="game-button1">
                        <MyButton count={count} setCount={setCount} />
                    </div>
                    <div className="game-button1">
                        <MyButton count={count} setCount={setCount} />
                    </div>
                </div>
            </div>
        </section>
    );
}

function useIncrementPoints(points, setPoints, count) {
    const countRef = useRef(count);

    useEffect(() => {
        countRef.current = count;
    }, [count]);

    // Interval is set up once and never restarts
    useEffect(() => {
        const interval = setInterval(() => {
            setPoints((p) => p + countRef.current);
        }, 1000);
        return () => clearInterval(interval);
    }, []);
}

function MyButton({ count, setCount }) {
    function handleClick() {
        setCount(count + 1);
    }
    return (
        <button onClick={handleClick}>
            Clicked {count} times
        </button>
    );
}