import { useState } from "react";
import  API_URL  from '../config/api';

const initialState = {
    owners:[]
}

const useInitialState = () =>{
    const [connected, setConnected] = useState(initialState);

    const addToMeeting = (payload) =>{
        setConnected({
            ...connected,
            owners:[...connected.owners, payload]
        });
    };

    const removeToMeeting = (payload) =>{
        setConnected({
            ...connected,
            owners: connected.owners.filter(items => items.id != payload.id)
        });
    }

    return {
        apiUrl: API_URL,
        connected,
        addToMeeting,
        removeToMeeting, 
    }
}
export default useInitialState;