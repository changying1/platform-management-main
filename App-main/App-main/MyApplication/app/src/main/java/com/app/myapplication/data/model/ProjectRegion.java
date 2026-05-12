package com.app.myapplication.data.model;

import java.util.List;

public class ProjectRegion {
    public Integer id;
    public String name;

    // 多边形点：[[lat,lng],[lat,lng],...]
    public List<double[]> points;
}
