import React from "react";
import ReactDOM from "react-dom";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3456";

class App extends React.Component {
    state = { target: null };
    async componentDidMount() {
        const response = await fetch(`${API_URL}/target`);
        const target = await response.text();
        this.setState({ target });
    }
    render() {
        const { target } = this.state;
        return target ? (
            <div className="greeting">{`Hello ${target}!`}</div>
        ) : (
            <div className="loading">{"Loading"}</div>
        );
    }
}

ReactDOM.render(<App />, document.getElementById("root"));
