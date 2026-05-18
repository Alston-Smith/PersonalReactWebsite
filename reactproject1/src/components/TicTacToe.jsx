import './TicTacToe.css'
import { useState } from 'react'


export default function TicTacToe() {
    const [size, setSize] = useState(5);
    const [history, setHistory] = useState([Array(size * size).fill(null)]);
    const [currentMove, setCurrentMove] = useState(0);
    const currentSquares = history[currentMove];
    const xIsNext = (currentMove % 2) === 0;

    //setup the move history list, which will allow the user to jump to any previous move in the game
    const moves = history.map((squares, move) => {
        let description;
        if (move > 0) {
            description = 'Go to move #' + move;
        } else {
            description = 'Go to game start';
        }
        return (
            <li key={move}>
                <button onClick={() => jumpTo(move)}>{description}</button>
            </li>
        );
    });

    //handlePlay will be passed to the board, and will update the game state when a move is made
    function handlePlay(nextSquares) {
        const nextHistory = [...history.slice(0, currentMove + 1), nextSquares];
        setHistory(nextHistory);
        setCurrentMove(nextHistory.length - 1);
    }

    function handleSizeChange(event) {
        const newSize = parseInt(event.target.value, 10);
        if (isNaN(newSize) || newSize < 1 || newSize > 100) return; // guard against bad input
        setSize(newSize);
        setHistory([Array(newSize * newSize).fill(null)]); // reset board for new size
        setCurrentMove(0);                                 // reset move pointer
    }

    //handles jumping to a previous move in the game, which will update the current move and the game state accordingly
    function jumpTo(nextMove) {
        setCurrentMove(nextMove);
        //setHistory(history.slice(0, nextMove + 1));
    }

    return (
        <div className="game">
            <div className="game-board">
                <Board size={size} xIsNext={xIsNext} squares={currentSquares} onPlay={handlePlay} />
            </div>
            <section id="game-state-section">
                <div className="user-board-size">
                    <GetUserBoardSize value={size} handleSizeChange={handleSizeChange} />
                </div>
                <div className="game-info">
                    <ol>{moves}</ol>
                </div>
            </section>
        </div>
    );
}

export function GetUserBoardSize({ value, handleSizeChange }) {
    return (
        <label>
            Board Size: <input type="number" min="1" max="100" defaultValue={value} onChange={(event) => {
                handleSizeChange(event);
            }} />
        </label>
    );
}



export function Board({ size, xIsNext, squares, onPlay }) {
    var rows = [];
    for (let i = 0; i < size; i++) {
        rows[i] = CreateRow(i, size, squares, handleClick).map(row => <div
            key={row.id}>
            {row.square}
        </div>);
    }

    var status = "Next player: " + (xIsNext ? 'X' : 'O');
    var winner = calculateWinner(squares, size, size);
    if (winner != null) { status = "Winner: " + winner; }

    function handleClick(position) {
        console.log("Clicked square " + position);
        const nextSquares = squares.slice();
        if (xIsNext) {
            if (nextSquares[position] == 'X') { nextSquares[position] = null; }
            else { nextSquares[position] = 'X'; }
        }
        else {
            if (nextSquares[position] == 'O') { nextSquares[position] = null; }
            else { nextSquares[position] = 'O'; }
        }
        onPlay(nextSquares);
    }

    var formatedBoard = [];
    for (let i = 0; i < size; i++) {
        formatedBoard[i] = formatBoard(i, rows[i]);
    }

    //this will display the board, scaling to the number of rows and columns specified at the top of the function
    return (
        <>
            <div className="status">{status}</div>
            {formatedBoard}
        </>
    );
}

function Square({ position, value, onSquareClick }) {
    return <button className="square" onClick={() => onSquareClick(position)}>
        {/* string to display */}
        {value}
    </button>;
}

function CreateRow(row, size, squares, onSquareClick) {
    var output = []
    for (let i = 0; i < size; i++) {
        var position = row * size + i
        output[i] = { square: <Square position={position} value={squares[position]} onSquareClick={onSquareClick} />, id: i }
    }

    return output
}

function calculateWinner(squares, numRows, numColumns) {
    var lines = []

    //add row victory conditions
    for (let x = 0; x < numRows; x++) {
        var row = [];
        for (let y = 0; y < numColumns; y++) {
            row[y] = x * numColumns + y;
        }
        lines[x] = row;
    }
    //add Column victory conditions
    for (let y = 0; y < numColumns; y++) {
        var column = [];
        for (let x = 0; x < numRows; x++) {
            column[x] = x * numColumns + y;
        }
        lines[y + numRows] = column;
    }

    //add diagonal topleft to bottomright victory condition
    var diagonal = [];
    for (let x = 0; x < numColumns; x++) {
        diagonal[x] = x * numColumns + x;
    }
    lines[numRows + numColumns] = diagonal;

    //add diagonal topright to bottomleft victory condition
    diagonal = [];
    for (let x = 0; x < numColumns; x++) {
        diagonal[x] = x * numColumns + (numColumns - 1 - x);
    }
    lines[numRows + numColumns + 1] = diagonal;

    //check victory conditions
    for (let i = 0; i < lines.length; i++) {
        if (squares[lines[i][0]] != null) {
            var shape = squares[lines[i][0]];
            for (let x = 1; x < lines[i].length; x++) {
                if (squares[lines[i][x]] != shape) { break; }
                //if we pass this check, we have a winner
                if (x == lines[i].length - 1) {
                    console.log("Victory: " + shape);
                    return shape;
                }
            }
        }
    }

    /*
    var output = "";
    for (let i = 0; i < lines.length; i++) {
        output += "Line " + i + ": "
        for (let x = 0; x < lines[i].length; x++) {
            output += lines[i][x] + ", ";
        }
        output += "\n";
    }
    console.log("Victory conditions:\n" + output); */
    return null;
}

function formatBoard(rowNum, row) {

    return (
        <div className="board-row" key={rowNum}>
            <div> {row} </div>
        </div>
    )
}