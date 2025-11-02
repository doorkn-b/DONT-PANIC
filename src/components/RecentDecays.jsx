import React, { useState, useEffect } from 'react';
import './RecentDecays.css';

function RecentDecays() {
  const [decayedSats, setDecayedSats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRecentDecays();
  }, []);

  const fetchRecentDecays = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:5000/api/recent-decays');
      const data = await response.json();
      
      if (data.success) {
        setDecayedSats(data.satellites);
      } else {
        setError('Failed to fetch decayed satellites');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="recent-decays-container">
        <div className="loading">Loading recent decays...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="recent-decays-container">
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="recent-decays-container">
      <div className="decays-header">
        <h2>RECENTLY DECAYED SATELLITES</h2>
      </div>

      <div className="decays-table-wrapper">
        <table className="decays-table">
          <thead>
            <tr>
              <th>NORAD ID</th>
              <th>NAME</th>
              <th>TYPE</th>
              <th>COUNTRY</th>
              <th>LAUNCH</th>
              <th>DECAY</th>
              <th>PERIOD</th>
              <th>INCL</th>
              <th>APOGEE</th>
              <th>PERIGEE</th>
              <th>SIZE</th>
            </tr>
          </thead>
          <tbody>
            {decayedSats.map((sat, index) => (
              <tr key={sat.norad_id} className={index % 2 === 0 ? 'even' : 'odd'}>
                <td className="norad-id">{sat.norad_id}</td>
                <td className="sat-name">{sat.name}</td>
                <td className="object-type">
                  <span className={`type-badge ${sat.object_type?.toLowerCase().replace(' ', '-')}`}>
                    {sat.object_type}
                  </span>
                </td>
                <td>{sat.country}</td>
                <td>{sat.launch_date}</td>
                <td className="decay-date">{sat.decay_date}</td>
                <td>{sat.period}</td>
                <td>{sat.inclination}°</td>
                <td>{sat.apogee} km</td>
                <td>{sat.perigee} km</td>
                <td>
                  <span className={`size-badge ${sat.rcs_size?.toLowerCase()}`}>
                    {sat.rcs_size}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="decays-footer">
        <p>Showing 10 most recent decays from Space-Track.org • Last updated: {new Date().toLocaleString()}</p>
      </div>
    </div>
  );
}

export default RecentDecays;
