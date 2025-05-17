import React, { useState } from "react";
import "./RatioPanel.css";

interface RatioPanelProps {
  onButtonClick?: () => void;
}

export const RatioPanel: React.FC<RatioPanelProps> = ({ onButtonClick }) => {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const togglePanel = () => {
    setIsPanelOpen(!isPanelOpen);
    if (onButtonClick) onButtonClick();
  };

  return (
    <div className="ratio-container">
      <div
        className="ant-divider ant-divider-horizontal Divider"
        role="separator"
      ></div>
      <div className="ratio-control">
        <button
          className={`ratio-button ${isPanelOpen ? "selected" : ""}`}
          onClick={togglePanel}
        >
          {" "}
          <svg
            className="SettingsPanelSvg"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="24"
            height="24"
          >
            <g
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              stroke="#FFFFFF"
            >
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 4 4 4-4" />
            </g>
          </svg>
        </button>
      </div>
      <div className={`ToolContent ${isPanelOpen ? "slideIn" : ""}`}>
        <div className="ToolContentHeader">
          <span
            className="ToolContentHeaderText"
            style={{ float: "left", paddingTop: "1rem", paddingLeft: "6px" }}
          >
            Ratios
          </span>
          <span
            role="button"
            className="fa fa-arrow-right"
            style={{
              cursor: "pointer",
              float: "right",
              paddingTop: "6%",
              paddingRight: "7%",
              fontSize: "15px",
            }}
          ></span>
        </div>
        <div className="OrderPanel">
          <div className="OrderPanelFilters">
            <div className="SearchSecurity">
              <div
                className="SearchSecurity  NoDraggable"
                style={{ fontSize: "0.825rem" }}
              >
                <div
                  className="ant-select ant-select-auto-complete ant-select-single ant-select-allow-clear ant-select-show-search"
                  style={{ width: "250px" }}
                >
                  <div className="ant-select-selector">
                    <span className="ant-select-selection-search">
                      <input
                        type="search"
                        autoComplete="off"
                        className="ant-select-selection-search-input"
                        role="combobox"
                        aria-haspopup="listbox"
                        aria-owns="rc_select_8_list"
                        aria-autocomplete="list"
                        aria-controls="rc_select_8_list"
                        aria-activedescendant="rc_select_8_list_0"
                        value=""
                        id="rc_select_8"
                      />
                    </span>
                    <span className="ant-select-selection-placeholder">
                      Filtrar por instrumento
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="FilterOrderStatus">
            <button
              value="pendientes"
              type="button"
              className="ant-btn ant-btn-default ant-btn-sm"
            >
              <span>Bonos</span>
            </button>
            <button
              value="ejecutadas"
              type="button"
              className="ant-btn ant-btn-default ant-btn-sm"
            >
              <span>Dolar</span>
            </button>
            <button
              value="todo"
              type="button"
              className="ant-btn ant-btn-default ant-btn-sm selected"
            >
              <span>Todo</span>
            </button>
          </div>
          <div
            className="OrderPanelList OrderPanelList"
            style={{ height: "calc(-410px + 100vh)" }}
          >
            <div className="OrdersGroup">
              <div
                className="ant-collapse ant-collapse-icon-position-start"
                style={{ background: "transparent" }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
