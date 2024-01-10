const loginApiResponse = {
  "success": true,
  "message": "Login successful",
  "data": {
    "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZ2VudF9pZCI6ImNsZmt2bjJzODAwMDBnMXBkdmNkYm16cjMiLCJuYW1lIjoiTG9kaGkiLCJyb2xlIjoiQURNSU4iLCJwaG9uZV9udW1iZXIiOiIwMDciLCJpYXQiOjE2Nzk2MzU3NDgsImV4cCI6MTY5NTE4Nzc0OH0.uO3DTF_RUBUwCAaL1BOwW7RvLVeSH6fIyulZkI3423E",
    "agent_info": {
      "agent_id": "clfkvn2s80000g1pdvcdbmzr3",
      "name": "Lodhi",
      "role": "ADMIN", // ADMIN = ASTRO | RM  
      "phone_number": "007"
    }
  }
}

const myInfo = {
  url: "/agent/me",
  response: {
    "success": true,
    "message": "Agent Details",
    "data": {
      "agent_id": "clfkvn2s80000g1pdvcdbmzr3",
      "name": "Lodhi",
      "role": "ADMIN",
      "isOnline": true,
    }
  }
}

const updateAgentOnlineStatus = {
  url: "/agent/me/online_status",
  requestJsonPayload: {
    is_online: true,
  },
  response: {
    success: true
  }
}

const agentLeads = {
  url: "/agent/me/leads",
  response: {
    success: false,
    message: "Lead Details",
    data: {
      retry_after: 15
    }
  },
  response2: {
    success: true,
    message: "Lead Details",
    data: {
      lead: {
        is_new_customer: true,
        booking_uuid: "abcdksjhfkjdshfds",
        user_uuid: "abcdksjhfkjdshfds",
        user_name: "Arun Lodhi",
        date_of_birth: "14-12-1990",
        time_of_birth: "3:00 AM",
        city_of_birth: "ABCD",
        state_of_birth: "Madhya Pradesh",
      },
      interested_in: [
        { id: 10, text: "5 min Call" },
        { id: 20, text: "Health" },
      ],
      note: {
        sku_id: 0,
        text: "Upsell Next Session"
      },
      call: {
        remaining_duration: 299,
        total_duration: 300,
      }
    },
  }
}

const rmLeads = {
  url: "/rm/me/leads",
  response: {
    "success": true,
    "message": "Lead Details",
    "data": {
      lead: {
        booking_uuid: booking.booking_uuid,
        user_uuid: user.user_uuid,
        user_name: user.user_name,
        date_of_birth: birth_details.raw?.date || "",
        time_of_birth: birth_details.raw?.time || "",
        city_of_birth: birth_details.raw?.city || "",
        state_of_birth: birth_details.raw?.state || "",
      },
      interested_in: [
        { id: 0, text: "5 min Call" },
      ],
      note: {
        sku_id: 0,
        text: "Upsell Next Session"
      },
      call: {
        remaining_duration: phone_call.user_answered_at ? phone_call.call_duration_ideal - ((Date.now() - phone_call.user_answered_at.getTime()) / 1000) : phone_call.call_duration_ideal,
        total_duration: phone_call.call_duration_ideal,
      }
    },
  }
}



const getFeedbackOptions = {
  url: "/bookings/:booking_uuid/feedback_options",
  response: {
    "success": true,
    "message": "Lead Details",
    "data": {
      "feedback_options": [
        {
          "parent_option_id": 210,
          "parent_text": "Payment Pending",
          "child_array": []
        },
        {
          "parent_option_id": 211,
          "parent_text": "Payment Link sent, call disconnected",
          "child_array": []
        },
        {
          "parent_option_id": 301,
          "parent_text": "Interested in",
          "child_array": [
            { "text": "Online Puja", "child_option_id": 203 },
            { "text": "Gemstone", "child_option_id": 204 },
            { "text": "Reiki Healing", "child_option_id": 205 },
            { "text": "Palmistry", "child_option_id": 206 }
          ]
        },
        {
          "parent_option_id": 302,
          "parent_text": "Not Interested",
          "child_array": [
            { "text": "Price too high", "child_option_id": 210 },
            { "text": "Not Trusted", "child_option_id": 208 },
            { "text": "Looking for offer/Discount", "child_option_id": 209 }
          ]
        }
      ]
    }
  }
}

const sendFeedbackOptions = {
  url: "/bookings/:booking_uuid/feedback",
  requestJsonPayload: {
    selected_feedback_options: [
      { parent_option_id: 302, child_option_id: 210 },
    ]
  },
  response: {
    "success": true,
    "message": "Feedback Successfully Submitted",
    "data": []
  }
};

