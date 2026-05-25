package com.app.myapplication.data.model.call;

import java.util.ArrayList;
import java.util.List;

public class AppVoiceRoomCreateRequest {
    public AppVoiceParticipant initiator;
    public List<AppVoiceParticipant> members = new ArrayList<>();
    public String title;
}
