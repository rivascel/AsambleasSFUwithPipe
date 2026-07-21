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
    const { approvalVotes, rejectVotes, blankVotes } = useContext(UserContext);
    // console.log("approvalVotes, rejectVotes, blankVotes", approvalVotes, rejectVotes, blankVotes);

    const data = {
      labels: ["Aprueba", "Rechaza", "Blanco"],
      datasets: [
        {
          label: "Votos",
          data: [approvalVotes, rejectVotes, blankVotes],
          backgroundColor: ["#4ade80", "#f87171", "#94a3b8"],
        },
      ],
    };
  // };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: "top" },
      title: { display: true, text: "Resumen de Votación" },
    },
  };

  return (
    <div className="bg-white p-4 rounded shadow-md">
      <h2 className="text-xl font-semibold mb-4 text-teal-600">Resultados Votación</h2>
      <Bar data={data} options={options} />
    </div>
  );
};

export default Graph;

