import React, { useEffect, useState, useContext } from 'react';
import { UserContext } from "../components/UserContext";

import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";


// Registrar los componentes necesarios de Chart.js
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const Graph = () => {
    const { approvalVotes, rejectVotes, blankVotes, optionsLabel } = useContext(UserContext);
    let approve; 
    let reject;
    let blank;
    let approvePorc,rejectPorc,blankPorc

    console.log("optionsLabel en el chart:", optionsLabel);
    
    const data = {
      labels: [
        optionsLabel?.option1 ?? "Aprueban",
        optionsLabel?.option2 ?? "Rechazan",
        optionsLabel?.option3 ?? "Blanco",
      ],
      datasets: [
        {
          label: "Votos",
          data: [approvalVotes, rejectVotes, blankVotes],
          backgroundColor: ["#4ade80", "#f87171", "#94a3b8"],
        },
      ],
    };


  useEffect(()=>{


    const results = () => {

      approve = approvalVotes;
      reject = rejectVotes;
      blank = blankVotes;

      const totalVotes = approvalVotes + rejectVotes + blankVotes;

      if (totalVotes === 0) {
        approvePorc = 0;
        rejectPorc = 0;
        blankPorc = 0;
      } else {
        approvePorc = (approvalVotes / totalVotes) * 100;
        rejectPorc = (rejectVotes / totalVotes) * 100;
        blankPorc = (blankVotes / totalVotes) * 100;
      }

      console.log("approvalVotes + rejectVotes + blankVotes",approvalVotes, rejectVotes, blankVotes);

      console.log("votos absolutos",approve,reject,blank);

      console.log("porcentajes",approvePorc,rejectPorc,blankPorc);

    }
    results();
  },[approvalVotes,rejectVotes,blankVotes])
    

  const options = {
    responsive: true,
    plugins: {
      legend: { position: "top" },
      title: { display: true, text: "Resumen de Votación" },
    },
  };

  return (
    <>
    <div className="bg-white p-4 rounded shadow-md" >
      <h2 className="text-xl font-semibold mb-4 text-teal-600">Resultados Votación</h2>
      <div className="w-75 h-50">
        <Bar data={data} options={options} />
      </div>
    </div>
    <div className="italic text-blue-600">
       {optionsLabel.option1 || "Aprueban:"} {approvalVotes} <br />
        {optionsLabel.option2 || "Rechazan:"} {rejectVotes} <br />
        {optionsLabel.option3 || "Blanco:"} {blankVotes} <br />
    </div>
    <div className="italic text-blue-600 w-75 h-50">
        Porc. Aprueban: {approvalVotes/(approvalVotes+rejectVotes+blankVotes)*100}% <br />
        Porc. Rechazan: {rejectVotes/(approvalVotes+rejectVotes+blankVotes)*100}% <br />
        Blanco:  {blankVotes/(approvalVotes+rejectVotes+rejectVotes)*100}% <br />
    </div>
    </>
  );
};

export default Graph;

